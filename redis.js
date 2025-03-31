const { createClient } = require('redis');

(async () => {
  const client = createClient({
    socket: {
      host: '127.0.0.1',
      port: 6379
    }
  });

  client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect();

  // Prueba de conexión y operaciones básicas
  await client.set('bot:test', 'Funciona!');
  const value = await client.get('bot:test');
  console.log(value); // Debería mostrar "Funciona!"

  await client.disconnect();
})();
