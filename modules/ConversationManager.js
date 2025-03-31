const whatsappWeb = require("whatsapp-web.js");
const MessageMedia = whatsappWeb.MessageMedia;
const Cotizacion = require("./Cotizacion"); // Asegúrate de que la ruta sea correcta
const contextoEmpresa = require('./data/contextoEmpresa');
const productos = require('./data/productos');
const RedisManager = require('./RedisManager'); // Añade esta línea

class ConversationManager {
  // En ConversationManager.js
  constructor(dbManager, deepSeekAPI, client) {
      this.dbManager = dbManager;
      this.deepSeekAPI = deepSeekAPI;
      this.client = client;
      this.clientesConBienvenida = {};
      this.intencionesCompra = {}; // Nuevo: para rastrear intenciones
      this.redisManager = new RedisManager(); // Instancia de RedisManager
      this.contextoEmpresa = contextoEmpresa;
      this.productos = productos;
  }



  async handleMessage(message) {
      const numeroCliente = message.from;
      const contenidoMensaje = message.body.trim(); // Eliminar espacios en blanco al inicio y final
      // Almacenar mensaje en Redis (memoria a corto plazo)
             await this.redisManager.pushToList(`client:${numeroCliente}:messages`, {
                 type: 'received',
                 content: contenidoMensaje,
                 timestamp: new Date().toISOString()
                  });
      console.log(`Mensaje recibido de ${numeroCliente}: ${contenidoMensaje}`);

      // Crear la tabla de interacciones si no existe
      try {
          await this.dbManager.createInteractionsTable(numeroCliente);
      } catch (error) {
          console.error("Error al crear la tabla de interacciones:", error);
      }

      // Guardar el mensaje recibido
      try {
          await this.dbManager.saveInteraction(numeroCliente, "mensaje_recibido", contenidoMensaje);
      } catch (error) {
          console.error("Error al guardar la interacción:", error);
      }

      // Guardar la interacción general (si es necesario)
      try {
          await this.dbManager.logInteraction(numeroCliente, "Nombre del Cliente"); // Puedes obtener el nombre del cliente si lo tienes
      } catch (error) {
          console.error("Error al guardar la interacción general:", error);
      }

      // Actualizar preguntas frecuentes
      try {
          await this.dbManager.actualizarPreguntasFrecuentes(contenidoMensaje);
      } catch (error) {
          console.error("Error al actualizar preguntas frecuentes:", error);
      }

      // Buscar si la pregunta tiene una respuesta frecuente
      const respuestaFrecuente = await this.dbManager.getRespuestaPreguntaFrecuente(contenidoMensaje);
      if (respuestaFrecuente) {
          await message.reply(respuestaFrecuente);
          return; // No continuar con el flujo normal
      }

      // Manejo de comandos (si el mensaje comienza con "!")
      if (contenidoMensaje.startsWith("!")) {
          await this.handleCommand(message);
          return;
      }

      // Verificar si las respuestas automáticas están activadas
      const respuestasAutomaticas = await this.dbManager.getAutomaticResponsesStatus(numeroCliente);
      if (respuestasAutomaticas === 0) {
          console.log(`Respuestas automáticas desactivadas para ${numeroCliente}.`);
          return; // No enviar ningún mensaje al usuario
      }

      // Mensaje de bienvenida (si es la primera interacción)
      if (!this.clientesConBienvenida[numeroCliente]) {
          await this.sendWelcomeMessage(numeroCliente);
          this.clientesConBienvenida[numeroCliente] = true;
          return;
      }

      // Manejo de opciones (1, 2, 3)
      if (contenidoMensaje === "1" || contenidoMensaje === "2" || contenidoMensaje === "3") {
          await this.handleOpciones(message, contenidoMensaje);
          return;
      }

      // Respuestas automáticas CON MEMORIA CONTEXTUAL


      // Respuestas automáticas (manteniendo la variable respuesta original)
      const respuesta = await this.getResponse(contenidoMensaje, numeroCliente); // Añadido numeroCliente como parámetro
      console.log("Respuesta obtenida:", respuesta); // Depuración

      if (respuesta.texto) {
          // Guardar la respuesta en la tabla de preguntas frecuentes para reutilizarla en el futuro
          try {
              await this.dbManager.actualizarPreguntasFrecuentes(contenidoMensaje, respuesta.texto);
          } catch (error) {
              console.error("Error al guardar la respuesta en preguntas frecuentes:", error);
          }

          // Enviar la respuesta al cliente
          await message.reply(respuesta.texto);
          // Verificar si es el mensaje de "contactará una persona de ventas"
               if (respuesta.texto.includes("Muchas gracias, en un momento te contactará una persona de ventas")) {
                   await this.enviarAlertaVentas(numeroCliente);
               }
          // Guardar la respuesta enviada
          try {
              await this.dbManager.saveInteraction(numeroCliente, "respuesta_enviada", respuesta.texto, 1);
          } catch (error) {
              console.error("Error al guardar la interacción:", error);
          }

          // Enviar imágenes y PDFs de todos los productos encontrados
          if (respuesta.productos && respuesta.productos.length > 0) {
              for (const producto of respuesta.productos) {
                  // Enviar imagen del producto
                  if (producto.imagen) {
                      try {
                          const media = MessageMedia.fromFilePath(producto.imagen);
                          await message.reply(media);

                          // Guardar la imagen enviada
                          await this.dbManager.saveInteraction(numeroCliente, "imagen_enviada", producto.imagen, 1);
                      } catch (error) {
                          console.error(`Error al enviar la imagen (${producto.imagen}):`, error);
                      }
                  }

                  // Enviar PDFs del producto
                  if (producto.pdfs && producto.pdfs.length > 0) {
                      for (const pdf of producto.pdfs) {
                          try {
                              const media = MessageMedia.fromFilePath(pdf);
                              await message.reply(media);

                              // Guardar el PDF enviado
                              await this.dbManager.saveInteraction(numeroCliente, "pdf_enviado", pdf, 1);
                          } catch (error) {
                              console.error(`Error al enviar el PDF (${pdf}):`, error);
                          }
                      }
                  }
              }
          }
      }
  }

  async enviarAlertaVentas(numeroCliente) {
      const numeroVentas = "5214642069081@c.us"; // Reemplaza con el número real del equipo de ventas
      const mensajeAlerta = `🚨 ALERTA DE CONTACTO 🚨\n\nContacta lo antes posible a: ${numeroCliente}\n\nCliente esperando seguimiento de ventas.`;

      try {
          await this.client.sendMessage(numeroVentas, mensajeAlerta);
          console.log(`Alerta de ventas enviada para ${numeroCliente}`);
      } catch (error) {
          console.error("Error al enviar alerta a ventas:", error);
      }
  }

    async handleOpciones(message, opcion) {
        const numeroCliente = message.from;

        switch (opcion) {
            case "1":
                // Opción 1: Ver lista de productos
                const listaProductos = "Aquí tienes nuestra lista de productos:\n\n" +
                    "1. Alineadores de Tubería\n" +
                    "2. Roladoras de Lámina\n" +
                    "3. Molinos\n" +
                    "4. Roladores de Perfil\n" +
                    "5. Sand Blast\n" +
                    "6. Silletas\n" +
                    "7. Transportadores\n" +
                    "8. Soldadora de Puntos\n" +
                    "9. Prensa Hidráulica\n" +
                    "10. Bordonadoras Manuales\n" +
                    "11. Cortadores de Tubo\n" +
                    "12. Dobladora de Lámina\n" +
                    "13. Mezcladora\n" +
                    "14. Punzonadora\n" +
                    "15. Sistema de Fuerza Motriz\n" +
                    "16. Tortugas\n" +
                    "17. Cizalla Manual Tipo Tijera\n\n" +
                    "¿Qué producto te interesa?";
                await message.reply(listaProductos);
                break;

            case "2":
                // Opción 2: Cotización de un producto
                await message.reply("Por favor, indícanos el nombre del producto para el cual deseas una cotización.");
                break;

            case "3":
                // Opción 3: Contactar con ventas
                await message.reply("Ponte en contacto con nuestro equipo de ventas al siguiente número: +52 123 456 7890.");
                break;

            default:
                // Opción no reconocida
                await message.reply("Opción no válida. Por favor, elige 1, 2 o 3.");
                break;
        }

        // Guardar la interacción de la opción seleccionada
        try {
            await this.dbManager.saveInteraction(numeroCliente, "opcion_seleccionada", opcion, 1);
        } catch (error) {
            console.error("Error al guardar la interacción de la opción seleccionada:", error);
        }
    }
    async handleCommand(message) {
        const comando = message.body.slice(1).split(" "); // Elimina el "!" y divide el comando
        const accion = comando[0].toLowerCase(); // Primera parte del comando (activar/desactivar)
        const numeroCliente = message.from;

        switch (accion) {
            case "activar":
                await this.dbManager.updateAutomaticResponses(numeroCliente, 1); // Activar respuestas
                console.log(`Respuestas automáticas activadas para ${numeroCliente}.`);
                break;

            case "desactivar":
                await this.dbManager.updateAutomaticResponses(numeroCliente, 0); // Desactivar respuestas
                console.log(`Respuestas automáticas desactivadas para ${numeroCliente}.`);
                break;

            default:
                await message.reply(`Comando "${accion}" no reconocido.`);
                break;
        }
    }

    async sendWelcomeMessage(numeroCliente) {
      const mensajeBienvenida = "💡 ¡Bienvenido a Quvana Herramientas! 💡\n\n" +
          "Somos una empresa 100% mexicana comprometida con la innovación y la calidad que se dedica al diseño y la fabricación de productos con el objetivo de ofrecer soluciones de calidad en herramientas y maquinaria. Nos especializamos en atender las necesidades de la industria metalmecánica, mantenimiento industrial, talleres de soldadura y pintura, fabricación de estructuras metálicas, instalación de tuberías de proceso, industria de alimentos y manufactura.\n\n" +
          "📍 Estamos ubicados en Salamanca, Guanajuato, México, en el corazón del corredor industrial del Bajío.\n\n" +
          "🔧 ¿En qué podemos ayudarte hoy? Elige una opción o cuéntanos qué necesitas:\n" +
          "1️⃣ Ver lista de productos\n" +
          "2️⃣ Contactar con ventas\n" +
          "También puedes escribir tu solicitud"
          ;

      // Ruta de la imagen de bienvenida
      const rutaImagenBienvenida = "G:/Mi unidad/Prácticas/Imagenes/LOGO.jpg"; // Cambia esto por la ruta correcta

      // Rutas de los PDFs de bienvenida
      const pdfsBienvenida = [
          "G:/Mi unidad/Prácticas/PDF/Principal-01.pdf", // Primer PDF
          "G:/Mi unidad/Prácticas/PDF/Principal-02.pdf" // Segundo PDF
      ];

      try {
          // Crear el objeto MessageMedia para la imagen
          const mediaImagen = MessageMedia.fromFilePath(rutaImagenBienvenida);

          // Enviar la imagen junto con el mensaje de bienvenida
          await this.client.sendMessage(numeroCliente, mediaImagen, { caption: mensajeBienvenida });

          // Guardar el mensaje de bienvenida enviado
          await this.dbManager.saveInteraction(numeroCliente, "mensaje_enviado", mensajeBienvenida, 1);

          // Guardar la imagen enviada
          await this.dbManager.saveInteraction(numeroCliente, "imagen_enviada", rutaImagenBienvenida, 1);

          // Enviar los PDFs de bienvenida
          for (const pdf of pdfsBienvenida) {
              try {
                  const mediaPdf = MessageMedia.fromFilePath(pdf);
                  await this.client.sendMessage(numeroCliente, mediaPdf);

                  // Guardar el PDF enviado
                  await this.dbManager.saveInteraction(numeroCliente, "pdf_enviado", pdf, 1);
              } catch (error) {
                  console.error(`Error al enviar el PDF (${pdf}):`, error);
              }
          }
      } catch (error) {
          console.error("Error al enviar el mensaje de bienvenida con imagen:", error);
      }
  }

  async getResponse(mensaje, numeroCliente) {
    // Obtener historial de Redis (memoria a corto plazo)
    const redisHistory = await this.redisManager.getList(`client:${numeroCliente}:messages`, 0, 5);

    // Obtener historial de la base de datos (memoria a largo plazo)
    const dbHistory = await this.dbManager.obtenerHistorialInteracciones(numeroCliente, 3);

    // Combinar ambos historiales
    const historialCompleto = [
        ...dbHistory.map(item => ({
            role: item.tipo === 'respuesta_enviada' ? 'assistant' : 'user',
            content: item.contenido
        })),
        ...redisHistory.filter(item => item.type === 'received').map(item => ({
            role: 'user',
            content: item.content
        }))
    ];

    // Formatear el contexto con ambos historiales
    const contexto = `${this.contextoEmpresa}\n\nHistorial reciente:\n${
        historialCompleto.map(msg => `${msg.role}: ${msg.content}`).join('\n')
    }\n\nPregunta actual: ${mensaje}`;

    // Obtener respuesta de la IA (FALTABA ESTA PARTE)
    const respuestaIA = await this.deepSeekAPI.getResponse(contexto, historialCompleto);

    // Resto de la lógica existente...
    const productosEnRespuesta = this.productos.filter(producto =>
        respuestaIA.toLowerCase().includes(producto.nombre.toLowerCase())
    );

    const productosMencionados = this.productos.filter(producto => {
        const nombreProducto = producto.nombre.toLowerCase();
        return mensaje.toLowerCase().includes(nombreProducto) ||
               producto.palabrasClave?.some(palabra =>
                   mensaje.toLowerCase().includes(palabra.toLowerCase())
               );
    });

    const productosUnicos = [...new Set([...productosEnRespuesta, ...productosMencionados])];

    return {
        texto: respuestaIA,
        productos: productosUnicos
    };
}


// Contexto de la empresa (mejor estructurado)
async manejarIntencionCompra(message, contenidoMensaje) {
    const numeroCliente = message.from;

    // Guardar estado en Redis en lugar de en memoria
    const tieneIntencion = await this.detectarIntencionCompra(contenidoMensaje);
    if (tieneIntencion) {
        await this.redisManager.setWithExpiry(
            `client:${numeroCliente}:purchase_intent`,
            true,
            86400 // Expira en 24 horas
        );
    }
    if (tieneIntencion) {
        this.intencionesCompra[numeroCliente] = true;

        // Verificar qué datos faltan
        const datosFaltantes = [];
        if (!datosCliente?.nombre) datosFaltantes.push("nombre");
        if (!datosCliente?.email) datosFaltantes.push("email");
        if (!datosCliente?.direccion) datosFaltantes.push("dirección");

        if (datosFaltantes.length > 0) {
            await message.reply(`Para procesar tu solicitud, necesito los siguientes datos: ${datosFaltantes.join(", ")}. Por favor, proporciónalos.`);
            return true; // Indicar que estamos en proceso de recolección
        }
    }

    return false; // No hay intención o ya tenemos los datos
}

async detectarIntencionCompra(mensaje) {
    const palabrasClave = ["comprar", "orden", "pedido", "quiero", "deseo", "necesito", "cotizar"];
    const contienePalabraClave = palabrasClave.some(palabra =>
        mensaje.toLowerCase().includes(palabra.toLowerCase())
    );

    if (contienePalabraClave) {
        const respuestaIA = await this.deepSeekAPI.getResponse(
            `El cliente dijo: "${mensaje}". ¿Expresa una intención clara de compra? Responde solo "SI" o "NO".`
        );
        return respuestaIA.trim().toUpperCase() === "SI";
    }

    return false;
}

async procesarDatosCliente(message, mensaje) {
    const numeroCliente = message.from;
    const datosActuales = await this.dbManager.obtenerDatosCliente(numeroCliente) || {};

    // Expresiones regulares para detectar diferentes tipos de datos
    const regexEmail = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const regexNombre = /(me llamo|mi nombre es|soy) ([a-zA-Z ]+)/i;

    const nuevosDatos = {};
    let datosObtenidos = false;

    // Detectar email
    if (!datosActuales.email) {
        const matchEmail = mensaje.match(regexEmail);
        if (matchEmail) {
            nuevosDatos.email = matchEmail[0];
            datosObtenidos = true;
        }
    }

    // Detectar nombre
    if (!datosActuales.nombre) {
        const matchNombre = mensaje.match(regexNombre);
        if (matchNombre && matchNombre[2]) {
            nuevosDatos.nombre = matchNombre[2].trim();
            datosObtenidos = true;
        } else if (mensaje.split(" ").length < 5) { // Mensaje corto, posiblemente solo el nombre
            nuevosDatos.nombre = mensaje;
            datosObtenidos = true;
        }
    }

    // Detectar dirección (patrón simple)
    if (!datosActuales.direccion && mensaje.toLowerCase().includes("direccion")) {
        nuevosDatos.direccion = mensaje.replace(/direccion:/i, "").trim();
        datosObtenidos = true;
    }

    return datosObtenidos ? { ...datosActuales, ...nuevosDatos } : null;
}


}
module.exports = ConversationManager;
