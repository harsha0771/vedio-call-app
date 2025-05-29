const WebSocket = require('ws');
const Redis = require('ioredis');

// Initialize Redis with your connection string
const redis = new Redis(process.env.REDIS_URL);

module.exports = async (req, res) => {
    if (!res.socket.server.wss) {
        const wss = new WebSocket.Server({ noServer: true });
        res.socket.server.wss = wss;

        wss.on('connection', async (ws, request) => {
            const url = new URL(request.url, 'http://localhost');
            const roomId = url.searchParams.get('roomId') || 'default';
            let clients = JSON.parse(await redis.get(`room:${roomId}`) || '[]');
            const connectionId = Math.random().toString(36).substring(2);

            clients.push({ id: connectionId, ws });
            await redis.set(`room:${roomId}`, JSON.stringify(clients));

            if (clients.length === 2) {
                clients[0].ws.send(JSON.stringify({ type: 'ready', initiator: true }));
                clients[1].ws.send(JSON.stringify({ type: 'ready', initiator: false }));
            }

            ws.on('message', async (msg) => {
                const currentClients = JSON.parse(await redis.get(`room:${roomId}`) || '[]');
                currentClients.forEach(client => {
                    if (client.id !== connectionId && client.ws.readyState === WebSocket.OPEN) {
                        client.ws.send(msg);
                    }
                });
            });

            ws.on('close', async () => {
                let updatedClients = JSON.parse(await redis.get(`room:${roomId}`) || '[]');
                updatedClients = updatedClients.filter(client => client.id !== connectionId);
                await redis.set(`room:${roomId}`, JSON.stringify(updatedClients));
            });
        });
    }

    res.socket.server.on('upgrade', (request, socket, head) => {
        res.socket.server.wss.handleUpgrade(request, socket, head, (ws) => {
            res.socket.server.wss.emit('connection', ws, request);
        });
    });

    res.end();
};