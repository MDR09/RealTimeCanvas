// Canvas Setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const remoteCanvas = document.getElementById('remoteCanvas');
const remoteCtx = remoteCanvas.getContext('2d');

// WebSocket Manager (already created globally in websocket.js)
// Just use the global wsManager instance

// Resize canvas to fill container
function resizeCanvas() {
    const container = document.querySelector('.canvas-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    remoteCanvas.width = container.clientWidth;
    remoteCanvas.height = container.clientHeight;
    redrawCanvas();
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);

// ============ Drawing State ============
let currentTool = 'brush';
let currentColor = '#000000';
let currentStrokeWidth = 3;
let isDrawing = false;
let startX = 0;
let startY = 0;

// Undo/Redo System
const history = [];
const redoStack = [];
const MAX_HISTORY = 50;

// User Information
let currentUser = {
    name: localStorage.getItem('userName') || 'Anonymous',
    roomId: localStorage.getItem('roomId') || 'LOADING',
    isHost: localStorage.getItem('isHost') === 'true',
    color: generateUserColor()
};

// Remote Users
const remoteUsers = new Map();

// ============ Initialization ============
function initCanvas() {
    console.log('🔧 Initializing canvas...');
    console.log('📍 Current User:', currentUser);

    // Display user info
    const userNameDisplay = document.getElementById('userNameDisplay');
    const roomIdDisplay = document.getElementById('roomIdDisplay');
    
    console.log('📝 Display elements:', { userNameDisplay, roomIdDisplay });

    if (userNameDisplay) {
        userNameDisplay.textContent = currentUser.name;
        console.log('✅ User name set to:', currentUser.name);
    } else {
        console.error('❌ userNameDisplay element not found');
    }

    if (roomIdDisplay) {
        roomIdDisplay.textContent = currentUser.roomId;
        console.log('✅ Room ID set to:', currentUser.roomId);
    } else {
        console.error('❌ roomIdDisplay element not found');
    }

    // Save initial canvas state
    saveHistory();

    // Setup event listeners
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch support
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);

    // Connect WebSocket
    connectWebSocket();

    console.log(`✅ Canvas initialized for ${currentUser.name} in room ${currentUser.roomId}`);
}

// ============ WebSocket Connection ============
async function connectWebSocket() {
    try {
        // Connect to server
        await wsManager.connect('http://localhost:3000');

        // Join room
        wsManager.joinRoom({
            roomId: currentUser.roomId,
            roomName: localStorage.getItem('roomName') || 'Room',
            userName: currentUser.name,
            userColor: currentUser.color,
            capacity: localStorage.getItem('roomCapacity') || 5,
            isHost: currentUser.isHost
        });

        // Setup WebSocket listeners
        setupWebSocketListeners();

    } catch (error) {
        console.error('❌ WebSocket connection failed:', error);
        document.getElementById('statusDisplay').textContent = '❌ Connection Failed';
        document.getElementById('statusDisplay').classList.add('error');
    }
}

function setupWebSocketListeners() {
    // Users list updated
    wsManager.on('users-list', (data) => {
        data.users.forEach(user => {
            if (user.id !== wsManager.socket.id) {
                addRemoteUser(user.id, user.name, user.color);
            }
        });
        updateUsersCount();
    });

    // User joined
    wsManager.on('user-joined', (data) => {
        console.log(`👤 ${data.userName} joined the room`);
        addRemoteUser(data.userId, data.userName, data.userColor);
        updateUsersCount();
    });

    // User left
    wsManager.on('user-left', (data) => {
        console.log(`👤 User left the room`);
        removeRemoteUser(data.userId);
        updateUsersCount();
    });

    // Remote drawing
    wsManager.on('remote-draw', (data) => {
        drawLineRemote(data.fromX, data.fromY, data.toX, data.toY, data.color, data.width, data.tool);
    });

    // Remote line drawing
    wsManager.on('remote-draw-line', (data) => {
        drawLineRemote(data.fromX, data.fromY, data.toX, data.toY, data.color, data.width, 'line');
    });

    // Remote clear canvas
    wsManager.on('remote-clear-canvas', () => {
        remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    });

    // Drawing history
    wsManager.on('drawing-history', (data) => {
        data.history.forEach(stroke => {
            drawLineRemote(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY, stroke.color, stroke.width, stroke.tool);
        });
    });

    // Remote cursor move
    wsManager.on('remote-cursor-move', (data) => {
        updateRemoteCursor(data.userId, data.x, data.y);
        if (remoteUsers.has(data.userId)) {
            remoteUsers.get(data.userId).x = data.x;
            remoteUsers.get(data.userId).y = data.y;
        }
    });

    // Room error
    wsManager.on('room-error', (data) => {
        alert(data.message);
        window.location.href = 'index.html';
    });
}

// ============ Drawing Functions ============
function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (currentTool === 'line') {
        saveHistory();
    }
}

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update position display
    document.getElementById('posDisplay').textContent = `${Math.round(x)}, ${Math.round(y)}`;

    // Send cursor position to others
    if (wsManager && wsManager.isSocketConnected()) {
        wsManager.sendCursorMove(x, y);
    }

    if (!isDrawing) return;

    if (currentTool === 'brush') {
        drawLine(startX, startY, x, y, currentColor, currentStrokeWidth);

        // Send to others
        if (wsManager && wsManager.isSocketConnected()) {
            wsManager.sendDraw({
                fromX: startX,
                fromY: startY,
                toX: x,
                toY: y,
                color: currentColor,
                width: currentStrokeWidth,
                tool: 'brush'
            });
        }

        startX = x;
        startY = y;
    } else if (currentTool === 'eraser') {
        erase(x, y, currentStrokeWidth);

        // Send to others
        if (wsManager && wsManager.isSocketConnected()) {
            wsManager.sendDraw({
                fromX: startX,
                fromY: startY,
                toX: x,
                toY: y,
                color: 'transparent',
                width: currentStrokeWidth,
                tool: 'eraser'
            });
        }

        startX = x;
        startY = y;
    } else if (currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') {
        redrawCanvas();
        
        if (currentTool === 'line') {
            drawLine(startX, startY, x, y, currentColor, currentStrokeWidth);
        } else if (currentTool === 'rectangle') {
            drawRectangle(startX, startY, x, y, currentColor, currentStrokeWidth);
        } else if (currentTool === 'circle') {
            drawCircle(startX, startY, x, y, currentColor, currentStrokeWidth);
        }
    }
}

function handleTouchStart(e) {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    startX = touch.clientX - rect.left;
    startY = touch.clientY - rect.top;
    isDrawing = true;

    if (currentTool === 'line') {
        saveHistory();
    }
}

function handleTouchMove(e) {
    if (!isDrawing) return;

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (currentTool === 'brush') {
        drawLine(startX, startY, x, y, currentColor, currentStrokeWidth);
        startX = x;
        startY = y;
    } else if (currentTool === 'eraser') {
        erase(x, y, currentStrokeWidth);
        startX = x;
        startY = y;
    } else if (currentTool === 'line') {
        redrawCanvas();
        drawLine(startX, startY, x, y, currentColor, currentStrokeWidth);
    }

    e.preventDefault();
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;

    // Send final shape stroke if shape tool
    if ((currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') && wsManager && wsManager.isSocketConnected()) {
        wsManager.sendDrawLine({
            fromX: startX,
            fromY: startY,
            toX: startX,
            toY: startY,
            color: currentColor,
            width: currentStrokeWidth,
            tool: currentTool
        });
    }

    saveHistory();
}

function drawLine(fromX, fromY, toX, toY, color, width) {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.closePath();
}

function drawLineRemote(fromX, fromY, toX, toY, color, width, tool) {
    if (tool === 'eraser') {
        remoteCtx.clearRect(fromX - width / 2, fromY - width / 2, width, width);
        remoteCtx.clearRect(toX - width / 2, toY - width / 2, width, width);
    } else if (tool === 'rectangle') {
        remoteCtx.strokeStyle = color;
        remoteCtx.lineWidth = width;
        remoteCtx.strokeRect(fromX, fromY, toX - fromX, toY - fromY);
    } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
        remoteCtx.strokeStyle = color;
        remoteCtx.lineWidth = width;
        remoteCtx.beginPath();
        remoteCtx.arc(fromX, fromY, radius, 0, 2 * Math.PI);
        remoteCtx.stroke();
    } else {
        remoteCtx.beginPath();
        remoteCtx.moveTo(fromX, fromY);
        remoteCtx.lineTo(toX, toY);
        remoteCtx.strokeStyle = color;
        remoteCtx.lineWidth = width;
        remoteCtx.lineCap = 'round';
        remoteCtx.lineJoin = 'round';
        remoteCtx.stroke();
        remoteCtx.closePath();
    }
}

function erase(x, y, size) {
    ctx.clearRect(x - size / 2, y - size / 2, size, size);
}

function drawRectangle(fromX, fromY, toX, toY, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(fromX, fromY, toX - fromX, toY - fromY);
}

function drawCircle(fromX, fromY, toX, toY, color, width) {
    const radius = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(fromX, fromY, radius, 0, 2 * Math.PI);
    ctx.stroke();
}

// ============ Tool Selection ============
function selectTool(tool) {
    currentTool = tool;

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tool + 'Tool').classList.add('active');

    // Update cursor
    if (tool === 'brush') {
        canvas.style.cursor = 'crosshair';
        document.getElementById('toolDisplay').textContent = 'Brush';
    } else if (tool === 'eraser') {
        canvas.style.cursor = 'cell';
        document.getElementById('toolDisplay').textContent = 'Eraser';
    } else if (tool === 'line') {
        canvas.style.cursor = 'crosshair';
        document.getElementById('toolDisplay').textContent = 'Line';
    } else if (tool === 'rectangle') {
        canvas.style.cursor = 'crosshair';
        document.getElementById('toolDisplay').textContent = 'Rectangle';
    } else if (tool === 'circle') {
        canvas.style.cursor = 'crosshair';
        document.getElementById('toolDisplay').textContent = 'Circle';
    }
}

// ============ Color & Stroke ============
function changeColor(color) {
    currentColor = color;
    document.getElementById('colorPreview').style.background = color;
}

function changeStrokeWidth(width) {
    currentStrokeWidth = width;
    document.getElementById('strokeDisplay').textContent = width;
}

// ============ Undo/Redo ============
function saveHistory() {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history.push(imageData);

    if (history.length > MAX_HISTORY) {
        history.shift();
    }

    redoStack.length = 0; // Clear redo stack when new action is made
}

function undoAction() {
    if (history.length <= 1) {
        alert('❌ Nothing to undo');
        return;
    }

    redoStack.push(history.pop());
    const previousState = history[history.length - 1];
    ctx.putImageData(previousState, 0, 0);

    // Send undo event
    if (wsManager && wsManager.isSocketConnected()) {
        wsManager.sendUndo();
    }
}

function redoAction() {
    if (redoStack.length === 0) {
        alert('❌ Nothing to redo');
        return;
    }

    const nextState = redoStack.pop();
    history.push(nextState);
    ctx.putImageData(nextState, 0, 0);

    // Send redo event
    if (wsManager && wsManager.isSocketConnected()) {
        wsManager.sendRedo();
    }
}

// ============ Canvas Actions ============
function clearCanvas() {
    if (confirm('⚠️ Are you sure you want to clear the entire canvas?')) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
        saveHistory();

        // Send clear event to others
        if (wsManager && wsManager.isSocketConnected()) {
            wsManager.clearCanvas();
        }
    }
}

function redrawCanvas() {
    if (history.length > 0) {
        ctx.putImageData(history[history.length - 1], 0, 0);
    }
}

function downloadCanvas() {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `canvas-${currentUser.roomId}-${Date.now()}.png`;
    link.click();
    console.log('✅ Canvas downloaded');
}

function toggleFullscreen() {
    const container = document.querySelector('.canvas-container');
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
    } else {
        document.exitFullscreen();
    }
}

// ============ User Management ============
function generateUserColor() {
    const colors = ['#667eea', '#764ba2', '#f5576c', '#f093fb', '#4ecdc4', '#44a08d'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function updateUsersCount() {
    const count = remoteUsers.size + 1;
    document.getElementById('usersCount').textContent = count;

    // Update users list
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';

    // Add current user
    const userBadge = document.createElement('span');
    userBadge.className = 'user-badge';
    userBadge.textContent = `👤 ${currentUser.name} (You)`;
    usersList.appendChild(userBadge);

    // Add remote users
    remoteUsers.forEach((user, userId) => {
        const badge = document.createElement('span');
        badge.className = 'user-badge';
        badge.style.borderLeft = `3px solid ${user.color}`;
        badge.textContent = `👤 ${user.name}`;
        usersList.appendChild(badge);
    });
}

function addRemoteUser(userId, name, color) {
    remoteUsers.set(userId, { name, color, x: 0, y: 0 });
    updateUsersCount();
}

function removeRemoteUser(userId) {
    remoteUsers.delete(userId);
    // Remove cursor indicator
    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) cursor.remove();
    updateUsersCount();
}

// ============ Remote Cursor Management ============
function updateRemoteCursor(userId, x, y) {
    let cursor = document.getElementById(`cursor-${userId}`);

    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${userId}`;
        cursor.className = 'remote-cursor';
        const user = remoteUsers.get(userId);
        const pointerDiv = document.createElement('div');
        pointerDiv.className = 'cursor-pointer';
        pointerDiv.style.borderColor = user ? user.color : '#667eea';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'cursor-label';
        labelDiv.textContent = user ? user.name : 'User';
        labelDiv.style.background = user ? user.color : '#667eea';

        cursor.appendChild(pointerDiv);
        cursor.appendChild(labelDiv);
        document.getElementById('cursorsContainer').appendChild(cursor);
    }

    cursor.style.left = (x - 10) + 'px';
    cursor.style.top = (y - 10) + 'px';
}

// ============ Room Management ============
function leaveRoom() {
    if (confirm('⚠️ Are you sure you want to leave this room?')) {
        // Disconnect WebSocket
        if (wsManager) {
            wsManager.disconnect();
        }

        localStorage.removeItem('userName');
        localStorage.removeItem('roomId');
        localStorage.removeItem('isHost');
        window.location.href = 'index.html';
    }
}

// ============ Initialize ============
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
});
