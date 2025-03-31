const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const DeepSeekAPI = require("./modules/DeepSeekAPI");
const DatabaseManager = require("./modules/DatabaseManager");
const ConversationManager = require("./modules/ConversationManager");
require("dotenv").config();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true },
});

const dbManager = new DatabaseManager("./data/databases.sqlite");
const deepSeekAPI = new DeepSeekAPI(process.env.DEEPSEEK_API_KEY);
const conversationManager = new ConversationManager(dbManager, deepSeekAPI, client); // Pasar client aquí

client.on("qr", (qr) => {
    console.log("Escanea este QR para iniciar sesión:");
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("¡Bot de WhatsApp está listo!");
});

client.on("message", async (message) => {
    try {
        await conversationManager.handleMessage(message);
    } catch (error) {
        console.error("Error al manejar el mensaje:", error);
    }
});

client.initialize();
