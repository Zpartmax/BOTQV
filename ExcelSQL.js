const xlsx = require("xlsx");
const sqlite3 = require("sqlite3").verbose();

// Ruta al archivo Excel
const excelFilePath = "./respuestas.xlsx";

// Ruta a la base de datos SQLite
const dbPath = "./data/databases.sqlite";

// Conectar a la base de datos SQLite
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error al conectar a la base de datos:", err);
        return;
    }
    console.log("Conectado a la base de datos SQLite.");
});

// Leer el archivo Excel
const workbook = xlsx.readFile(excelFilePath);
const sheetName = workbook.SheetNames[0]; // Suponiendo que los datos están en la primera hoja
const worksheet = workbook.Sheets[sheetName];

// Convertir la hoja de Excel a JSON
const respuestas = xlsx.utils.sheet_to_json(worksheet);

// Insertar datos en la tabla `respuestas`
respuestas.forEach((respuesta) => {
    const { palabra_clave, respuesta: texto, imagen, pdf } = respuesta;

    db.run(
        `INSERT INTO respuestas (palabra_clave, respuesta, imagen, pdf)
         VALUES (?, ?, ?, ?)`,
        [palabra_clave, texto, imagen, pdf],
        (err) => {
            if (err) {
                console.error("Error al insertar respuesta:", err);
            } else {
                console.log(`Respuesta insertada: ${palabra_clave}`);
            }
        }
    );
});

// Cerrar la conexión a la base de datos
db.close((err) => {
    if (err) {
        console.error("Error al cerrar la base de datos:", err);
    } else {
        console.log("Conexión a la base de datos cerrada.");
    }
});
