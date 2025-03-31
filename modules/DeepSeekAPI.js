const axios = require('axios');

class DeepSeekAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.url = 'https://api.deepseek.com/v1/chat/completions';
    }

  async getResponse(mensaje, historial = []) {
        const apiKey = 'sk-3619532d15b14799a6e616db61dd91ac'; // Reemplaza con tu API Key de DeepSeek
        const url = 'https://api.deepseek.com/v1/chat/completions'; // URL de la API de DeepSeek

        try {
            const response = await axios.post(url, {
                model: "deepseek-chat", // Modelo de DeepSeek
                messages: [
                    { role: "system", content: "Eres un asistente de Quvana Herramientas, especializado en herramientas y maquinaria industrial. Responde de manera concisa y directa en menos de 25 palabras, sin comentarios adicionales." +
                         "Mantén el contexto de la conversación actual. Responde de manera concisa y profesional."}, // Contexto del sistema
                    { role: "user", content: mensaje } // Mensaje del usuario
                ],
                max_tokens: 300, // Limitar el número de tokens (opcional)
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // Obtener la respuesta generada por DeepSeek
            let respuesta = response.data.choices[0].message.content;

            // Limitar la respuesta a un máximo de 20 palabras (opcional)
            const palabras = respuesta.split(" ");
            if (palabras.length > 30) {
                respuesta = palabras.slice(0, 30).join(" ") + "..."; // Truncar a 25 palabras
            }

            return respuesta; // Devuelve la respuesta generada
        } catch (error) {
            console.error("Error al obtener respuesta de DeepSeek:", error);
            return null;
        }
    }
}

module.exports = DeepSeekAPI;
