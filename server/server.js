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
            userRedoStacks: new Map(), // Per-user redo stacks
            createdAt: new Date()
        });
        console.log(`Room created: ${roomName} (${roomId})`);
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
        console.log(`${userName} joined room ${roomId} (${room.users.size}/${room.capacity})`);
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
            console.log(`${user.name} left room ${roomId}`);
        }

        // Delete room if empty
        if (room.users.size === 0) {
            rooms.delete(roomId);
            console.log(`Room deleted: ${roomId}`);
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
    console.log(`New connection: ${socket.id}`);

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
            socket.emit('room-error', { message: 'ERROR: Room not found' });
            return;
        }

        if (room.users.size >= room.capacity) {
            socket.emit('room-error', { message: 'ERROR: Room is full' });
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

        console.log(`Room ${roomId} has ${room.users.size} user(s)`);
    });

    // Drawing events
    socket.on('draw', (data) => {
        if (!socket.roomId) return;

        const { fromX, fromY, toX, toY, color, width, tool, strokeId } = data;

        // Store in history (only store actual strokes/segments)
        if (tool === 'brush' || tool === 'eraser') {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.drawingHistory.push({
                    fromX, fromY, toX, toY, color, width, tool,
                    userId: socket.id,
                    strokeId: strokeId || null,
                    timestamp: Date.now()
                });

                // Clear this user's redo stack when they draw new stroke group
                room.userRedoStacks.delete(socket.id);

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
            tool,
            strokeId
        });
    });

    // Draw line event (shapes: line, rectangle, circle)
    socket.on('draw-line', (data) => {
        if (!socket.roomId) return;

        const room = rooms.get(socket.roomId);
        if (room) {
            room.drawingHistory.push({
                ...data,
                userId: socket.id,
                strokeId: data.strokeId || null,
                timestamp: Date.now()
            });

            // Clear this user's redo stack when they draw new stroke
            room.userRedoStacks.delete(socket.id);
        }

        socket.to(socket.roomId).emit('draw-line', {
            userId: socket.id,
            userName: socket.userName,
            ...data
        });
    });

    // Clear canvas event - clear globally for all users in the room
    socket.on('clear-canvas', () => {
        if (!socket.roomId) return;

        const room = rooms.get(socket.roomId);
        if (room) {
            // Clear drawing history and per-user redo stacks
            room.drawingHistory = [];
            room.userRedoStacks = new Map();
            console.log(`Room ${socket.roomId} canvas cleared by ${socket.id}`);

            // Broadcast full-history-update (empty history) to ALL clients in the room
            io.to(socket.roomId).emit('full-history-update', { history: room.drawingHistory });
        }
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

    // Undo event - Only undo THIS user's last stroke
    socket.on('undo', () => {
        console.log(`\n>>>>>>>>>>> UNDO RECEIVED FROM CLIENT <<<<<<<<<<<`);
        console.log(`User ${socket.id} requested undo`);

        if (!socket.roomId) {
            console.log('No room ID, returning');
            return;
        }

        const room = rooms.get(socket.roomId);
        console.log(`Room found:`, !!room);
        if (!room) return;

        console.log(`Current history length: ${room.drawingHistory.length}`);
        console.log(`Looking for last stroke group by userId: ${socket.id}`);

        // Find last stroke entry for this user (to get its strokeId)
        let targetStrokeId = null;
        for (let i = room.drawingHistory.length - 1; i >= 0; i--) {
            const stroke = room.drawingHistory[i];
            if (stroke.userId === socket.id) {
                targetStrokeId = stroke.strokeId || null;
                break;
            }
        }

        if (targetStrokeId === null) {
            // No strokeId available; fallback to removing the last single stroke by this user
            for (let i = room.drawingHistory.length - 1; i >= 0; i--) {
                const stroke = room.drawingHistory[i];
                if (stroke.userId === socket.id) {
                    const removed = room.drawingHistory.splice(i, 1)[0];
                    if (!room.userRedoStacks.has(socket.id)) room.userRedoStacks.set(socket.id, []);
                    room.userRedoStacks.get(socket.id).push({ strokes: [removed] });
                    console.log(`Removed single stroke (no strokeId) at index ${i}`);
                    io.to(socket.roomId).emit('full-history-update', { history: room.drawingHistory });
                    return;
                }
            }

            console.log('No strokes found for user to undo');
            return;
        }

        // Remove all drawingHistory entries that match this strokeId for this user
        const removedGroup = [];
        for (let i = room.drawingHistory.length - 1; i >= 0; i--) {
            const stroke = room.drawingHistory[i];
            if (stroke.userId === socket.id && stroke.strokeId === targetStrokeId) {
                // remove and unshift to keep original order
                removedGroup.unshift(room.drawingHistory.splice(i, 1)[0]);
            }
        }

        if (removedGroup.length > 0) {
            if (!room.userRedoStacks.has(socket.id)) room.userRedoStacks.set(socket.id, []);
            // Store the group as a single redo unit
            room.userRedoStacks.get(socket.id).push({ strokes: removedGroup });
            console.log(`SUCCESS: Removed stroke group with id ${targetStrokeId}, items: ${removedGroup.length}`);

            // Broadcast updated history to all clients
            io.to(socket.roomId).emit('full-history-update', { history: room.drawingHistory });
            console.log('Broadcasted full-history-update after undo');
        } else {
            console.log('No stroke group removed (maybe already undone)');
        }
    });

    // Redo event - Only redo THIS user's last undone stroke
    socket.on('redo', () => {
        console.log(`\n>>>>>>>>>>> REDO RECEIVED FROM CLIENT <<<<<<<<<<<`);
        console.log(`User ${socket.id} requested redo`);

        if (!socket.roomId) {
            console.log('No room ID, returning');
            return;
        }

        const room = rooms.get(socket.roomId);
        if (!room) return;

        const userRedoStack = room.userRedoStacks.get(socket.id);
        console.log(`User's redo stack has ${userRedoStack?.length || 0} items`);

        if (userRedoStack && userRedoStack.length > 0) {
            // Pop the last group and restore all strokes
            const group = userRedoStack.pop();
            if (group && Array.isArray(group.strokes) && group.strokes.length > 0) {
                // Append strokes back to history (preserving their internal order)
                group.strokes.forEach(st => room.drawingHistory.push(st));
                console.log(`Restored group with ${group.strokes.length} strokes`);

                // Broadcast updated history to ALL users in the room
                io.to(socket.roomId).emit('full-history-update', { history: room.drawingHistory });
                console.log('Broadcasted full-history-update after redo');
            }
        } else {
            console.log('No items in redo stack');
        }
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

        console.log(`User disconnected: ${socket.id}`);
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
    res.json({ status: 'Server is running' });
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
   Collaborative Canvas Server
Server running on port ${PORT}
URL: http://localhost:${PORT}
Stats: http://localhost:${PORT}/stats
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
