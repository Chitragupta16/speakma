const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

class SignalingServer {
    constructor(port = 8080) {
        this.port = port;
        this.rooms = new Map(); // roomId -> Set of clients
        this.clients = new Map(); // ws -> {room, id}
        
        this.setupServer();
    }

    setupServer() {
        // Create HTTP server to serve static files and health check
        const server = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'ok', 
                    rooms: Array.from(this.rooms.keys()),
                    connections: this.clients.size,
                    timestamp: new Date().toISOString()
                }));
            } else if (req.url === '/' || req.url === '/index.html') {
                // Serve the main HTML file
                this.serveFile(res, path.join(__dirname, '../client/index.html'), 'text/html');
            } else if (req.url === '/styles.css') {
                this.serveFile(res, path.join(__dirname, '../client/styles.css'), 'text/css');
            } else if (req.url === '/script.js') {
                this.serveFile(res, path.join(__dirname, '../client/script.js'), 'application/javascript');
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        // Create WebSocket server
        this.wss = new WebSocket.Server({ server });
        
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            console.log(`Client ${clientId} connected from ${req.socket.remoteAddress}`);
            
            this.clients.set(ws, { id: clientId, room: null });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error('Invalid JSON message:', error);
                    this.sendError(ws, 'Invalid message format');
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.handleDisconnect(ws);
            });

            // Send welcome message
            this.send(ws, {
                type: 'connected',
                clientId: clientId
            });
        });

        server.listen(this.port, '0.0.0.0', () => {
            console.log(`🚀 WebRTC Signaling Server running on port ${this.port}`);
            console.log(`📊 Health check available at http://localhost:${this.port}/health`);
            console.log(`🌐 Web interface available at http://localhost:${this.port}`);
            this.printNetworkInfo();
        });
    }

    serveFile(res, filePath, contentType) {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }

    handleMessage(ws, message) {
        const client = this.clients.get(ws);
        
        switch (message.type) {
            case 'join':
                this.handleJoinRoom(ws, message.room);
                break;
                
            case 'leave':
                this.handleLeaveRoom(ws);
                break;
                
            case 'offer':
            case 'answer':
            case 'ice-candidate':
                this.relayMessage(ws, message);
                break;
                
            default:
                console.warn(`Unknown message type: ${message.type}`);
                this.sendError(ws, 'Unknown message type');
        }
    }

    handleJoinRoom(ws, roomId) {
        if (!roomId) {
            this.sendError(ws, 'Room ID is required');
            return;
        }

        const client = this.clients.get(ws);
        
        // Leave current room if in one
        if (client.room) {
            this.handleLeaveRoom(ws);
        }

        // Create room if it doesn't exist
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }

        const room = this.rooms.get(roomId);

        // Check room capacity (limit to 2 for P2P)
        if (room.size >= 2) {
            this.sendError(ws, 'Room is full (maximum 2 participants)');
            return;
        }

        // Add client to room
        room.add(ws);
        client.room = roomId;

        console.log(`Client ${client.id} joined room ${roomId} (${room.size}/2)`);

        // Notify client of successful join
        this.send(ws, {
            type: 'joined',
            room: roomId,
            participants: room.size
        });

        // Notify other participants
        this.broadcastToRoom(roomId, {
            type: 'user-joined',
            room: roomId,
            participants: room.size
        }, ws);
    }

    handleLeaveRoom(ws) {
        const client = this.clients.get(ws);
        
        if (!client.room) return;

        const room = this.rooms.get(client.room);
        if (room) {
            room.delete(ws);
            
            console.log(`Client ${client.id} left room ${client.room}`);

            // Notify remaining participants
            this.broadcastToRoom(client.room, {
                type: 'user-left',
                room: client.room,
                participants: room.size
            });

            // Clean up empty room
            if (room.size === 0) {
                this.rooms.delete(client.room);
                console.log(`Room ${client.room} deleted (empty)`);
            }
        }

        client.room = null;
    }

    handleDisconnect(ws) {
        const client = this.clients.get(ws);
        if (!client) return;

        console.log(`Client ${client.id} disconnected`);

        // Leave room if in one
        this.handleLeaveRoom(ws);

        // Remove client
        this.clients.delete(ws);
    }

    relayMessage(ws, message) {
        const client = this.clients.get(ws);
        
        if (!client.room) {
            this.sendError(ws, 'Not in a room');
            return;
        }

        // Relay to other participants in the room
        this.broadcastToRoom(client.room, message, ws);
    }

    broadcastToRoom(roomId, message, excludeWs = null) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.forEach(ws => {
            if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
                this.send(ws, message);
            }
        });
    }

    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    sendError(ws, error) {
        this.send(ws, {
            type: 'error',
            message: error
        });
    }

    generateClientId() {
        return Math.random().toString(36).substr(2, 9);
    }

    printNetworkInfo() {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        
        console.log('\n📡 Available network interfaces:');
        
        Object.keys(interfaces).forEach(name => {
            interfaces[name].forEach(iface => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`   ${name}: http://${iface.address}:${this.port}`);
                }
            });
        });
        
        console.log('\n💡 Usage:');
        console.log('   1. Open any of the above URLs in your browser');
        console.log('   2. Or connect multiple devices to the same URL');
        console.log('   3. Join the same room ID to start video calling\n');
    }
}

// Start the server
const port = process.env.PORT || 8080;
new SignalingServer(port);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});