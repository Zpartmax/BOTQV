const { createClient } = require('redis');

class RedisManager {
    constructor() {
        // Configuración específica para Windows
        this.client = createClient({
            socket: {
                host: '127.0.0.1',
                port: 6379
            },
            // Añade esta línea para manejar reconexiones
            disableOfflineQueue: false
        });

        this.client.on('error', (err) => {
            console.error('Redis Client Error', err);
            // Intenta reconectar después de 5 segundos
            setTimeout(() => this.client.connect(), 5000);
        });

        this.connect();
    }

    async connect() {
        try {
            await this.client.connect();
            console.log('Conectado a Redis');
        } catch (err) {
            console.error('Error al conectar a Redis:', err);
        }
    }

    // Almacenar datos con expiración (en segundos)
    async setWithExpiry(key, value, ttl = 3600) { // 1 hora por defecto
        await this.client.set(key, JSON.stringify(value), { EX: ttl });
    }

    // Obtener datos
    async get(key) {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }

    // Eliminar datos
    async del(key) {
        await this.client.del(key);
    }

    // Almacenar datos en una lista
    async pushToList(key, value) {
        await this.client.rPush(key, JSON.stringify(value));
    }

    // Obtener elementos de una lista
    async getList(key, start = 0, end = -1) {
        const list = await this.client.lRange(key, start, end);
        return list.map(item => JSON.parse(item));
    }

    // Limpiar datos de un cliente específico
    async clearClientData(phoneNumber) {
        const keys = await this.client.keys(`client:${phoneNumber}:*`);
        if (keys.length > 0) {
            await this.client.del(keys);
        }
    }
}

module.exports = RedisManager;
