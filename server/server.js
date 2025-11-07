const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, '../client')));

// Room Management
const rooms = new Map();

// ============ Helper Functions ============
function createRoom(roomId, roomName, capacity) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            roomId,
            roomName,
            capacity,
            users: new Map(),
            drawingHistory: [],
            createdAt: new Date()
        });
        console.log(`✅ Room created: ${roomName} (${roomId})`);
    }
}

function addUserToRoom(roomId, userId, userName, userColor) {
    const room = rooms.get(roomId);
    if (room && room.users.size < room.capacity) {
        room.users.set(userId, {
            id: userId,
            name: userName,
            color: userColor,
            x: 0,
            y: 0
        });
        console.log(`✅ ${userName} joined room ${roomId} (${room.users.size}/${room.capacity})`);
        return true;
    }
    return false;
}

function removeUserFromRoom(roomId, userId) {
    const room = rooms.get(roomId);
    if (room) {
        const user = room.users.get(userId);
        if (user) {
            room.users.delete(userId);
            console.log(`❌ ${user.name} left room ${roomId}`);
        }

        // Delete room if empty
        if (room.users.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Room deleted: ${roomId}`);
        }
    }
}

function getRoomUsers(roomId) {
    const room = rooms.get(roomId);
    if (room) {
        return Array.from(room.users.values());
    }
    return [];
}

// ============ Socket.IO Events ============
io.on('connection', (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);

    // User joins room
    socket.on('join-room', (data) => {
        const { roomId, roomName, userName, userColor, capacity, isHost } = data;

        // Create room if it doesn't exist and user is host
        if (isHost) {
            createRoom(roomId, roomName, capacity);
        }

        // Add user to room
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('room-error', { message: '❌ Room not found' });
            return;
        }

        if (room.users.size >= room.capacity) {
            socket.emit('room-error', { message: '❌ Room is full' });
            return;
        }

        // Add user to room
        addUserToRoom(roomId, socket.id, userName, userColor);

        // Join socket to room
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;
        socket.userColor = userColor;

        // Send current users to new user
        const users = getRoomUsers(roomId);
        socket.emit('users-list', { users });

        // Notify others that user joined
        socket.to(roomId).emit('user-joined', {
            userId: socket.id,
            userName: userName,
            userColor: userColor,
            users: users
        });

        // Send drawing history to new user
        if (room.drawingHistory.length > 0) {
            socket.emit('drawing-history', { history: room.drawingHistory });
        }

        console.log(`📍 Room ${roomId} has ${room.users.size} user(s)`);
    });

    // Drawing events
    socket.on('draw', (data) => {
        if (!socket.roomId) return;

        const { fromX, fromY, toX, toY, color, width, tool } = data;

        // Store in history (only store actual strokes, not intermediate points)
        if (tool === 'brush' || tool === 'eraser') {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.drawingHistory.push({
                    fromX, toY, toX, toY, color, width, tool,
                    userId: socket.id,
                    timestamp: Date.now()
                });

                // Limit history size
                if (room.drawingHistory.length > 1000) {
                    room.drawingHistory.shift();
                }
            }
        }

        // Broadcast to others in room
        socket.to(socket.roomId).emit('draw', {
            userId: socket.id,
            userName: socket.userName,
            fromX,
            fromY,
            toX,
            toY,
            color,
            width,
            tool
        });
    });

    // Draw line event
    socket.on('draw-line', (data) => {
        if (!socket.roomId) return;

        const room = rooms.get(socket.roomId);
        if (room) {
            room.drawingHistory.push({
                ...data,
                userId: socket.id,
                timestamp: Date.now()
            });
        }

        socket.to(socket.roomId).emit('draw-line', {
            userId: socket.id,
            userName: socket.userName,
            ...data
        });
    });

    // Clear canvas event
    socket.on('clear-canvas', () => {
        if (!socket.roomId) return;

        const room = rooms.get(socket.roomId);
        if (room) {
            room.drawingHistory = [];
        }

        socket.to(socket.roomId).emit('clear-canvas');
    });

    // Mouse move / Cursor tracking
    socket.on('cursor-move', (data) => {
        if (!socket.roomId) return;

        const { x, y } = data;

        // Update user position
        const room = rooms.get(socket.roomId);
        if (room) {
            const user = room.users.get(socket.id);
            if (user) {
                user.x = x;
                user.y = y;
            }
        }

        // Broadcast cursor position to others
        socket.to(socket.roomId).emit('cursor-move', {
            userId: socket.id,
            userName: socket.userName,
            userColor: socket.userColor,
            x,
            y
        });
    });

    // Undo event
    socket.on('undo', () => {
        if (!socket.roomId) return;

        socket.to(socket.roomId).emit('undo', {
            userId: socket.id,
            userName: socket.userName
        });
    });

    // Redo event
    socket.on('redo', () => {
        if (!socket.roomId) return;

        socket.to(socket.roomId).emit('redo', {
            userId: socket.id,
            userName: socket.userName
        });
    });

    // User disconnects
    socket.on('disconnect', () => {
        if (socket.roomId) {
            removeUserFromRoom(socket.roomId, socket.id);

            // Notify others
            const users = getRoomUsers(socket.roomId);
            io.to(socket.roomId).emit('user-left', {
                userId: socket.id,
                users: users
            });
        }

        console.log(`❌ Disconnected: ${socket.id}`);
    });

    // Ping/Pong for connection check
    socket.on('ping', () => {
        socket.emit('pong');
    });
});

// ============ Routes ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/canvas', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/canvas.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: '✅ Server is running' });
});

// Get server stats
app.get('/stats', (req, res) => {
    const stats = {
        totalRooms: rooms.size,
        totalUsers: Array.from(rooms.values()).reduce((sum, room) => sum + room.users.size, 0),
        rooms: Array.from(rooms.values()).map(room => ({
            roomId: room.roomId,
            roomName: room.roomName,
            users: room.users.size,
            capacity: room.capacity
        }))
    };
    res.json(stats);
});

// ============ Server Start ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🎨 Collaborative Canvas Server 🎨    ║
╠════════════════════════════════════════╣
║  ✅ Server running on port ${PORT}          ║
║  📍 URL: http://localhost:${PORT}        ║
║  📊 Stats: http://localhost:${PORT}/stats   ║
╚════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
