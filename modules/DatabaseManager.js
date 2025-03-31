const sqlite3 = require('sqlite3').verbose();

class DatabaseManager {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error("Error al conectar a la base de datos:", err);
            } else {
                console.log("Conectado a la base de datos SQLite.");
                this.initializeDatabase();
            }
        });
    }


    async initializeDatabase() {
        return new Promise((resolve, reject) => {

            // Crear la tabla de interacciones si no existe
            this.db.run(`
                CREATE TABLE IF NOT EXISTS interacciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    numero_cliente TEXT NOT NULL UNIQUE,
                    nombre TEXT,
                    ultima_interaccion TEXT,
                    total_interacciones INTEGER DEFAULT 1,
                    respuestas_automaticas INTEGER DEFAULT 1
                )
            `, (err) => {
                if (err) {
                    console.error("Error al crear la tabla de interacciones:", err);
                    reject(err);
                } else {
                    console.log("Tabla de interacciones creada o verificada.");
                }
            });
            this.db.run(`
    CREATE TABLE IF NOT EXISTS respuestas_pdf (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        palabra_clave TEXT NOT NULL,
        pdf TEXT NOT NULL,
        FOREIGN KEY(palabra_clave) REFERENCES respuestas(palabra_clave)
    )
`, (err) => {
    if (err) {
        console.error("Error al crear la tabla de respuestas_pdf:", err);
    } else {
        console.log("Tabla de respuestas_pdf creada o verificada.");
    }
});

            // Crear la tabla de preguntas frecuentes si no existe
            this.db.run(`
                CREATE TABLE IF NOT EXISTS preguntas_frecuentes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pregunta TEXT NOT NULL UNIQUE,
                    frecuencia INTEGER DEFAULT 1,
                    respuesta TEXT
                )
            `, (err) => {
                if (err) {
                    console.error("Error al crear la tabla de preguntas frecuentes:", err);
                    reject(err);
                } else {
                    console.log("Tabla de preguntas frecuentes creada o verificada.");
                    resolve();
                }
            });
        });
    }

  async getAutomaticResponsesStatus(numeroCliente) {
      return new Promise((resolve, reject) => {
          this.db.get(
              "SELECT respuestas_automaticas FROM interacciones WHERE numero_cliente = ?",
              [numeroCliente],
              (err, row) => {
                  if (err) {
                      console.error("Error al obtener el estado de respuestas automáticas:", err);
                      reject(err);
                  } else {
                      resolve(row ? row.respuestas_automaticas : 1); // Por defecto, activadas
                  }
              }
          );
      });
  }

    async getResponse(keyword) {
        return new Promise((resolve, reject) => {
            const keywordNormalized = keyword.toLowerCase(); // Convertir a minúsculas
            console.log(`Buscando respuesta para la palabra clave: ${keywordNormalized}`); // Depuración

            this.db.get(
                "SELECT respuesta, imagen, pdf FROM respuestas WHERE LOWER(palabra_clave) = ?",
                [keywordNormalized], // Usar la palabra clave normalizada
                (err, row) => {
                    if (err) {
                        console.error("Error al buscar respuesta en la base de datos:", err);
                        reject(err);
                    } else {
                        console.log("Resultado de la búsqueda:", row); // Depuración
                        resolve(row ? row : null);
                    }
                }
            );
        });
    }

    async logInteraction(numeroCliente, nombre) {
        return new Promise((resolve, reject) => {
            console.log(`Intentando guardar interacción para: ${numeroCliente}`); // Depuración
            this.db.run(
                `INSERT INTO interacciones (numero_cliente, nombre, ultima_interaccion, respuestas_automaticas)
                 VALUES (?, ?, datetime('now'), 1)  -- Respuestas automáticas activadas por defecto
                 ON CONFLICT(numero_cliente) DO UPDATE SET
                 nombre = excluded.nombre,
                 ultima_interaccion = excluded.ultima_interaccion,
                 total_interacciones = total_interacciones + 1`,
                [numeroCliente, nombre],
                (err) => {
                    if (err) {
                        console.error("Error al guardar interacción:", err);
                        reject(err);
                    } else {
                        console.log(`Interacción guardada para el cliente: ${numeroCliente}`);
                        resolve();
                    }
                }
            );
        });
    }
    async updateAutomaticResponses(numeroCliente, estado) {
    return new Promise((resolve, reject) => {
        this.db.run(
            `UPDATE interacciones SET respuestas_automaticas = ? WHERE numero_cliente = ?`,
            [estado, numeroCliente],
            (err) => {
                if (err) {
                    console.error("Error al actualizar respuestas automáticas:", err);
                    reject(err);
                } else {
                    console.log(`Respuestas automáticas ${estado === 1 ? "activadas" : "desactivadas"} para ${numeroCliente}`);
                    resolve();
                }
            }
        );
    });
}
async createInteractionsTable(numeroCliente) {
    return new Promise((resolve, reject) => {
        const tableName = `interacciones_${numeroCliente.replace(/[^0-9]/g, '')}`; // Elimina caracteres no numéricos
        const query = `
            CREATE TABLE IF NOT EXISTS ${tableName} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha_hora TEXT NOT NULL,
                tipo TEXT NOT NULL,
                contenido TEXT NOT NULL,
                respuesta_automatica INTEGER DEFAULT 0
            )
        `;

        this.db.run(query, (err) => {
            if (err) {
                console.error(`Error al crear la tabla de interacciones para ${numeroCliente}:`, err);
                reject(err);
            } else {
                console.log(`Tabla de interacciones creada para el cliente: ${numeroCliente}`);
                resolve();
            }
        });
    });
}
async getPalabrasClave() {
    return new Promise((resolve, reject) => {
        this.db.all(
            "SELECT palabra_clave FROM respuestas",
            (err, rows) => {
                if (err) {
                    console.error("Error al obtener palabras clave:", err);
                    reject(err);
                } else {
                    const palabrasClave = rows.map(row => row.palabra_clave.toLowerCase());
                    resolve(palabrasClave);
                }
            }
        );
    });
}
async saveInteraction(numeroCliente, tipo, contenido, respuestaAutomatica = 0) {
    return new Promise((resolve, reject) => {
        const tableName = `interacciones_${numeroCliente.replace(/[^0-9]/g, '')}`; // Elimina caracteres no numéricos
        const query = `
            INSERT INTO ${tableName} (fecha_hora, tipo, contenido, respuesta_automatica)
            VALUES (datetime('now'), ?, ?, ?)
        `;

        this.db.run(query, [tipo, contenido, respuestaAutomatica], (err) => {
            if (err) {
                console.error(`Error al guardar interacción para ${numeroCliente}:`, err);
                reject(err);
            } else {
                console.log(`Interacción guardada para el cliente: ${numeroCliente}`);
                resolve();
            }
        });
    });
}
async actualizarPreguntasFrecuentes(pregunta, respuesta) {
    return new Promise((resolve, reject) => {
        const preguntaNormalizada = pregunta.toLowerCase().trim(); // Normalizar la pregunta

        // Buscar si la pregunta ya existe en la tabla de preguntas frecuentes
        this.db.get(
            "SELECT id, frecuencia FROM preguntas_frecuentes WHERE pregunta = ?",
            [preguntaNormalizada],
            (err, row) => {
                if (err) {
                    console.error("Error al buscar pregunta frecuente:", err);
                    reject(err);
                } else if (row) {
                    // Si la pregunta ya existe, incrementar su frecuencia y actualizar la respuesta
                    this.db.run(
                        "UPDATE preguntas_frecuentes SET frecuencia = frecuencia + 1, respuesta = ? WHERE id = ?",
                        [respuesta, row.id],
                        (err) => {
                            if (err) {
                                console.error("Error al actualizar pregunta frecuente:", err);
                                reject(err);
                            } else {
                                console.log(`Pregunta frecuente actualizada: ${preguntaNormalizada}`);
                                resolve();
                            }
                        }
                    );
                } else {
                    // Si la pregunta no existe, agregarla a la tabla con la respuesta
                    this.db.run(
                        "INSERT INTO preguntas_frecuentes (pregunta, frecuencia, respuesta) VALUES (?, 1, ?)",
                        [preguntaNormalizada, respuesta],
                        (err) => {
                            if (err) {
                                console.error("Error al guardar pregunta frecuente:", err);
                                reject(err);
                            } else {
                                console.log(`Pregunta frecuente guardada: ${preguntaNormalizada}`);
                                resolve();
                            }
                        }
                    );
                }
            }
        );
    });
}
async actualizarPreguntasFrecuentes(pregunta, respuesta = "") {
    return new Promise((resolve, reject) => {
        const preguntaNormalizada = pregunta.toLowerCase().trim(); // Normalizar la pregunta

        // Buscar si la pregunta ya existe en la tabla de preguntas frecuentes
        this.db.get(
            "SELECT id, frecuencia FROM preguntas_frecuentes WHERE pregunta = ?",
            [preguntaNormalizada],
            (err, row) => {
                if (err) {
                    console.error("Error al buscar pregunta frecuente:", err);
                    reject(err);
                } else if (row) {
                    // Si la pregunta ya existe, incrementar su frecuencia y actualizar la respuesta (si se proporciona)
                    this.db.run(
                        "UPDATE preguntas_frecuentes SET frecuencia = frecuencia + 1, respuesta = ? WHERE id = ?",
                        [respuesta || row.respuesta, row.id], // Mantener la respuesta existente si no se proporciona una nueva
                        (err) => {
                            if (err) {
                                console.error("Error al actualizar frecuencia:", err);
                                reject(err);
                            } else {
                                console.log(`Frecuencia incrementada para la pregunta: ${preguntaNormalizada}`);
                                resolve();
                            }
                        }
                    );
                } else {
                    // Si la pregunta no existe, agregarla a la tabla con la respuesta (si se proporciona)
                    this.db.run(
                        "INSERT INTO preguntas_frecuentes (pregunta, frecuencia, respuesta) VALUES (?, 1, ?)",
                        [preguntaNormalizada, respuesta],
                        (err) => {
                            if (err) {
                                console.error("Error al guardar pregunta frecuente:", err);
                                reject(err);
                            } else {
                                console.log(`Pregunta frecuente guardada: ${preguntaNormalizada}`);
                                resolve();
                            }
                        }
                    );
                }
            }
        );
    });
}
async asignarRespuestaAPreguntaFrecuente(pregunta, respuesta) {
    return new Promise((resolve, reject) => {
        const preguntaNormalizada = pregunta.toLowerCase().trim();

        this.db.run(
            "UPDATE preguntas_frecuentes SET respuesta = ? WHERE pregunta = ?",
            [respuesta, preguntaNormalizada],
            (err) => {
                if (err) {
                    console.error("Error al asignar respuesta a pregunta frecuente:", err);
                    reject(err);
                } else {
                    console.log(`Respuesta asignada a la pregunta: ${preguntaNormalizada}`);
                    resolve();
                }
            }
        );
    });
}


async getRespuestaPreguntaFrecuente(pregunta) {
    return new Promise((resolve, reject) => {
        const preguntaNormalizada = pregunta.toLowerCase().trim();

        this.db.get(
            "SELECT respuesta FROM preguntas_frecuentes WHERE pregunta = ?",
            [preguntaNormalizada],
            (err, row) => {
                if (err) {
                    console.error("Error al buscar respuesta de pregunta frecuente:", err);
                    reject(err);
                } else if (row && row.respuesta) {
                    resolve(row.respuesta); // Devolver la respuesta si existe
                } else {
                    resolve(null); // No se encontró una respuesta
                }
            }
        );
    });
}

async obtenerHistorialInteracciones(numeroCliente, limite = 3) {
    return new Promise((resolve, reject) => {
        const tableName = `interacciones_${numeroCliente.replace(/[^0-9]/g, '')}`;

        this.db.all(
            `SELECT tipo, contenido FROM ${tableName}
             WHERE tipo IN ('mensaje_recibido', 'respuesta_enviada')
             ORDER BY fecha_hora DESC
             LIMIT ?`,
            [limite],
            (err, rows) => {
                if (err) {
                    console.error(`Error al obtener historial para ${numeroCliente}:`, err);
                    reject(err);
                } else {
                    resolve(rows.reverse()); // Orden cronológico correcto
                }
            }
        );
    });
}
 }

module.exports = DatabaseManager;
