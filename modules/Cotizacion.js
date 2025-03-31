const ExcelJS = require("exceljs");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");

// Configurar Puppeteer con el plugin Stealth
puppeteer.use(StealthPlugin());

class Cotizacion {
    constructor(client, dbManager) {
        this.client = client;
        this.dbManager = dbManager;
        this.estadosConversacion = {};
    }

    // Función para iniciar el proceso de cotización
    async iniciarProcesoCotizacion(message) {
        const numeroCliente = message.from;
        const datosCliente = await this.dbManager.obtenerDatosCliente(numeroCliente);

        if (datosCliente && datosCliente.nombre && datosCliente.email && datosCliente.empresa) {
            // Si ya tenemos datos del cliente, saltar directamente a pedir producto
            this.estadosConversacion[numeroCliente] = {
                nombre: datosCliente.nombre,
                correo: datosCliente.email,
                empresa: datosCliente.empresa,
                estado: "esperando_producto"
            };

            await this.enviarConDelay(message,
                `Gracias ${datosCliente.nombre}. ¿Qué producto deseas cotizar?`,
                1000);
        } else {
            // Si no tenemos datos, comenzar el flujo normal
            this.estadosConversacion[numeroCliente] = "esperando_nombre";
            await this.enviarConDelay(message,
                "Por favor, proporciona tu nombre para continuar con la cotización.",
                1000);
        }
    }

    // Función para manejar el flujo de la cotización
    async manejarCotizacion(message) {
        const numeroCliente = message.from;
        const contenidoMensaje = message.body.trim();

        // Si el bot está esperando el nombre del cliente
        if (this.estadosConversacion[numeroCliente] === "esperando_nombre") {
            const nombreCliente = contenidoMensaje;
            this.estadosConversacion[numeroCliente] = {
                nombre: nombreCliente,
                estado: "esperando_correo"
            };

            await this.enviarConDelay(message,
                `Gracias, ${nombreCliente}. Por favor, proporciona tu correo electrónico.`,
                1000);
            return;
        }

        // Si el bot está esperando el correo electrónico
        if (this.estadosConversacion[numeroCliente]?.estado === "esperando_correo") {
            const correo = contenidoMensaje;

            // Validación simple de email
            if (!correo.includes("@") || !correo.includes(".")) {
                await this.enviarConDelay(message,
                    "Por favor, ingresa un correo electrónico válido.",
                    1000);
                return;
            }

            this.estadosConversacion[numeroCliente].correo = correo;
            this.estadosConversacion[numeroCliente].estado = "esperando_empresa";

            await this.enviarConDelay(message,
                "Gracias. Ahora, por favor, proporciona el nombre de tu compañía.",
                1000);
            return;
        }

        // Si el bot está esperando el nombre de la compañía
        if (this.estadosConversacion[numeroCliente]?.estado === "esperando_empresa") {
            const empresa = contenidoMensaje;
            this.estadosConversacion[numeroCliente].empresa = empresa;
            this.estadosConversacion[numeroCliente].estado = "esperando_producto";

            // Guardar datos en la base de datos antes de continuar
            try {
                await this.dbManager.guardarDatosCliente(numeroCliente, {
                    nombre: this.estadosConversacion[numeroCliente].nombre,
                    email: this.estadosConversacion[numeroCliente].correo,
                    empresa: empresa
                });
            } catch (error) {
                console.error("Error al guardar datos del cliente:", error);
            }

            await this.enviarConDelay(message,
                "Gracias. ¿Qué producto deseas cotizar?",
                1000);
            return;
        }

        // Si el bot está esperando el producto a cotizar
        if (this.estadosConversacion[numeroCliente]?.estado === "esperando_producto") {
            const producto = contenidoMensaje.toLowerCase();

            // Aquí puedes validar contra una lista de productos reales
            this.estadosConversacion[numeroCliente].producto = producto;
            this.estadosConversacion[numeroCliente].estado = "esperando_codigo_postal";

            await this.enviarConDelay(message,
                `Perfecto, cotizaremos ${producto}. Por último, proporciona tu código postal.`,
                1000);
            return;
        }

        // Si el bot está esperando el código postal
        if (this.estadosConversacion[numeroCliente]?.estado === "esperando_codigo_postal") {
            const codigoPostalDestino = contenidoMensaje;
            const datosCotizacion = this.estadosConversacion[numeroCliente];

            try {
                // Actualizar los datos del cliente en el archivo de Excel
                await this.actualizarDatosCliente(
                    datosCotizacion.nombre,
                    datosCotizacion.correo,
                    datosCotizacion.empresa
                );

                // Obtener la cotización de envío
                const cotizacion = await this.obtenerCotizacionTresGuerras(codigoPostalDestino);

                if (cotizacion) {
                    await this.actualizarCotizacionEnExcel(cotizacion);

                    // Guardar información adicional en la base de datos
                    try {
                        await this.dbManager.guardarDatosCliente(numeroCliente, {
                            otrosDatos: {
                                ultimaCotizacion: {
                                    producto: datosCotizacion.producto,
                                    fecha: new Date().toISOString(),
                                    codigoPostal: codigoPostalDestino
                                }
                            }
                        });
                    } catch (error) {
                        console.error("Error al guardar datos de cotización:", error);
                    }

                    await this.enviarConDelay(
                        message,
                        `Gracias ${datosCotizacion.nombre}, hemos registrado tu solicitud de cotización para ${datosCotizacion.producto}. Nos pondremos en contacto contigo pronto.`,
                        1000
                    );
                } else {
                    await this.enviarConDelay(
                        message,
                        "Gracias por tu solicitud. No pudimos calcular el costo de envío en este momento. Nos pondremos en contacto contigo pronto.",
                        1000
                    );
                }
            } catch (error) {
                console.error("Error al procesar la cotización:", error);
                await this.enviarConDelay(
                    message,
                    "Hubo un error al procesar tu cotización. Por favor, intenta nuevamente.",
                    1000
                );
                return;
            }

            // Restablecer el estado de la conversación
            this.estadosConversacion[numeroCliente] = null;
            return;
        }
    }

    // Función para actualizar los datos del cliente en el archivo Excel
    async actualizarDatosCliente(nombreCliente, correo, empresa) {
        const cotizacionFilePath = path.join(__dirname, "cotizaciones/COT.-QVN_ESB.xlsx");

        try {
            // Cargar el archivo Excel existente
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(cotizacionFilePath);

            // Obtener la hoja de trabajo (asume que la hoja se llama "COTIZACION")
            const worksheet = workbook.getWorksheet("COTIZACION");

            // Actualizar las celdas específicas sin afectar el formato
            if (worksheet.getCell("B6")) {
                worksheet.getCell("B6").value = nombreCliente; // Nombre del cliente
            }
            if (worksheet.getCell("B7")) {
                worksheet.getCell("B7").value = correo; // Correo electrónico
            }
            if (worksheet.getCell("B8")) {
                worksheet.getCell("B8").value = empresa; // Nombre de la empresa
            }

            // Guardar el archivo actualizado
            await workbook.xlsx.writeFile(cotizacionFilePath);
            console.log("Datos del cliente actualizados en el archivo Excel.");
        } catch (error) {
            console.error("Error al actualizar los datos del cliente:", error);
            throw error;
        }
    }

    // Función para obtener la cotización de Tres Guerras
    async obtenerCotizacionTresGuerras(codigoPostalDestino) {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        try {
            await page.goto("https://www.tresguerras.com.mx/3G/cotizadorcp.php", {
                waitUntil: "networkidle2",
            });

            await page.evaluate(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            await new Promise(r => setTimeout(r, 15000));

            await page.type('input[id="txtOrigen"]', "36700");
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 5000));

            await page.type('input[id="txtDestino"]', codigoPostalDestino);
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 5000));

            console.log("Código Postal ingresado:", codigoPostalDestino);

            await page.type('input[id="bulto[0]"]', "1");
            await page.type('input[id="peso[0]"]', "72");
            await page.type('input[id="largo[0]"]', "0.71");
            await page.type('input[id="ancho[0]"]', "0.55");
            await page.type('input[id="alto[0]"]', "1.05");

            await page.waitForSelector('a#btnTracking', { visible: true });
            await page.click('a#btnTracking');
            await new Promise(r => setTimeout(r, 10000));

            await page.waitForFunction(() => {
                const precio = document.querySelector('#precioPP');
                return precio && precio.innerText !== "$99,999.00";
            }, { timeout: 15000 });

            const precioCotizacion = await page.evaluate(() => {
                const elemento = document.querySelector('#precioPP');
                return elemento ? elemento.innerText : null;
            });

            console.log("Valor de la cotización obtenido:", precioCotizacion);

            await browser.close();
            return precioCotizacion;
        } catch (error) {
            console.error("Error al obtener la cotización de Tres Guerras:", error);
            await browser.close();
            return null;
        }
    }

    // Función para actualizar la cotización en el archivo Excel
    async actualizarCotizacionEnExcel(precioCotizacion) {
        const cotizacionFilePath = path.join(__dirname, "cotizaciones/COT.-QVN_ESB.xlsx");

        try {
            // Cargar el archivo Excel existente
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(cotizacionFilePath);

            // Obtener la hoja de trabajo (asume que la hoja se llama "COTIZACION")
            const worksheet = workbook.getWorksheet("COTIZACION");

            // Actualizar solo la celda G25 con el valor de la cotización
            if (worksheet.getCell("G25")) {
                worksheet.getCell("G25").value = precioCotizacion;
            }

            // Guardar el archivo actualizado
            await workbook.xlsx.writeFile(cotizacionFilePath);
            console.log("Cotización actualizada en el archivo Excel.");
        } catch (error) {
            console.error("Error al actualizar la cotización en Excel:", error);
            throw error;
        }
    }

    // Función para enviar mensajes con un retraso
    async enviarConDelay(message, mensaje, delay) {
        return new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    await message.reply(mensaje);
                } catch (error) {
                    console.error("Error al enviar mensaje:", error);
                }
                resolve();
            }, delay);
        });
    }
}

module.exports = Cotizacion;
