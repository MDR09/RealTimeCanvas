# 🏗️ ARCHITECTURE.md - Real-Time Collaborative Canvas

## System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                           │
│                     (HTML5 + Vanilla JavaScript)                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Landing Page                Canvas Page                        │
│  ┌────────────────┐          ┌─────────────────────────┐       │
│  │  index.html    │    →     │    canvas.html          │       │
│  │  style.css     │          │    canvas-style.css     │       │
│  │  main.js       │          │    canvas.js            │       │
│  └────────────────┘          │    websocket.js         │       │
│                              └─────────────────────────┘       │
│         Room Creation/Join              Drawing + Real-time    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                               ↕ WebSocket (Socket.IO)
                            (Bidirectional Events)
┌──────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                            │
│                    (Node.js + Express + Socket.IO)               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Express Server (server.js)                                     │
│  ├─ HTTP Routes                                                 │
│  │  ├─ GET /                    → Landing page                  │
│  │  ├─ GET /canvas              → Canvas page                   │
│  │  ├─ GET /health              → Health check                  │
│  │  └─ GET /stats               → Server statistics             │
│  │                                                              │
│  └─ Socket.IO Server                                            │
│     ├─ Room Manager                                             │
│     │  ├─ createRoom()                                          │
│     │  ├─ addUserToRoom()                                       │
│     │  ├─ removeUserFromRoom()                                  │
│     │  └─ getRoomUsers()                                        │
│     │                                                           │
│     ├─ Event Handlers                                           │
│     │  ├─ join-room              → User joins room              │
│     │  ├─ draw                   → Drawing stroke               │
│     │  ├─ draw-line              → Line drawing                 │
│     │  ├─ clear-canvas           → Clear command                │
│     │  ├─ cursor-move            → Cursor position              │
│     │  ├─ undo/redo              → Undo/Redo commands           │
│     │  └─ disconnect             → User leaves                  │
│     │                                                           │
│     └─ Data Storage (Session)                                   │
│        ├─ Rooms Map              → All active rooms             │
│        ├─ Drawing History        → Per-room history             │
│        └─ User Sessions          → Per-socket data              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📊 Component Architecture

### Frontend Components

#### 1. Landing Page Module
```
main.js (Landing Logic)
├─ generateRoomId()        → Generate 12-char random ID
├─ switchMode()            → Toggle Create/Join
├─ createRoom()            → Create new room
├─ joinRoom()              → Join existing room
└─ Validation & UI Updates
```

**Responsibilities:**
- Handle room creation flow
- Validate user inputs
- Store session data in localStorage
- Redirect to canvas page

#### 2. Canvas Module
```
canvas.js (Drawing Logic)
├─ Drawing Layer
│  ├─ selectTool()         → Switch tools (brush/eraser/line)
│  ├─ startDrawing()       → Begin drawing action
│  ├─ handleMouseMove()    → Draw as user moves mouse
│  ├─ stopDrawing()        → End drawing action
│  └─ drawLine()           → Draw line primitives
│
├─ History Layer
│  ├─ saveHistory()        → Save canvas state
│  ├─ undoAction()         → Undo last action
│  ├─ redoAction()         → Redo last undone action
│  └─ redrawCanvas()       → Redraw from history
│
└─ UI Control
   ├─ changeColor()        → Update color picker
   ├─ changeStrokeWidth()  → Update brush size
   ├─ clearCanvas()        → Clear entire canvas
   └─ downloadCanvas()     → Export as PNG
```

**Responsibilities:**
- Handle all drawing interactions
- Manage canvas state
- Provide undo/redo functionality
- Update UI elements

#### 3. WebSocket Module
```
websocket.js (Connection Manager)
├─ WebSocketManager Class
│  ├─ connect()            → Connect to server
│  ├─ loadSocketIO()       → Load Socket.IO library
│  ├─ setupListeners()     → Register event handlers
│  ├─ joinRoom()           → Emit join-room event
│  ├─ sendDraw()           → Send drawing data
│  ├─ sendCursorMove()     → Send cursor position
│  └─ disconnect()         → Close connection
│
└─ Callback System
   ├─ on()                 → Register event callback
   └─ emit()               → Trigger callbacks
```

**Responsibilities:**
- Manage WebSocket connection
- Handle Socket.IO library loading
- Implement event callback system
- Provide send methods for all event types

---

### Backend Components

#### Server (server.js)

```
Express Server Setup
├─ Middleware
│  ├─ CORS Support
│  └─ Static Files
│
├─ HTTP Routes
│  ├─ GET /              → Serve landing page
│  ├─ GET /canvas        → Serve canvas page
│  ├─ GET /health        → Health check endpoint
│  └─ GET /stats         → Server statistics
│
└─ Socket.IO Server
   ├─ Connection Handler
   │  └─ io.on('connection', socket => {...})
   │
   ├─ Room Management
   │  ├─ rooms = new Map()
   │  ├─ createRoom()
   │  ├─ addUserToRoom()
   │  ├─ removeUserFromRoom()
   │  └─ getRoomUsers()
   │
   ├─ Event Handlers
   │  ├─ 'join-room'         → Add user to room
   │  ├─ 'draw'              → Broadcast drawing
   │  ├─ 'draw-line'         → Broadcast line
   │  ├─ 'clear-canvas'      → Broadcast clear
   │  ├─ 'cursor-move'       → Broadcast cursor
   │  ├─ 'undo'              → Broadcast undo
   │  ├─ 'redo'              → Broadcast redo
   │  └─ 'disconnect'        → Remove user
   │
   └─ Broadcast System
      ├─ socket.to(room).emit()   → Send to room
      ├─ io.to(room).emit()       → Send to all in room
      └─ socket.emit()            → Send to user only
```

---

## 🔄 Data Flow Architecture

### 1. Room Creation Flow
```
User Input (Landing Page)
    ↓
main.js: createRoom()
    ↓
Generate Room ID (12 chars)
    ↓
Store in localStorage
    ↓
Redirect to canvas.html
    ↓
canvas.js: initCanvas()
    ↓
connectWebSocket()
    ↓
websocket.js: connect()
    ↓
Load Socket.IO library
    ↓
Join room with isHost=true
    ↓
server.js: 'join-room' event
    ↓
createRoom() (server-side)
    ↓
addUserToRoom()
    ↓
Send 'users-list' to user
    ↓
Canvas Ready
```

### 2. Drawing Synchronization Flow
```
User Draws on Canvas
    ↓
canvas.js: handleMouseMove()
    ↓
drawLine() (local canvas)
    ↓
websocket.js: sendDraw()
    ↓
emit 'draw' event with data
    ↓
server.js receives 'draw'
    ↓
Store in drawingHistory
    ↓
socket.to(room).emit('draw')
    ↓
canvas.js: setupWebSocketListeners()
    ↓
wsManager.on('remote-draw')
    ↓
drawLineRemote() (remote canvas)
    ↓
All users see drawing
```

### 3. Cursor Tracking Flow
```
User Moves Mouse
    ↓
canvas.js: handleMouseMove()
    ↓
Update position display
    ↓
websocket.js: sendCursorMove(x, y)
    ↓
emit 'cursor-move' event
    ↓
server.js receives 'cursor-move'
    ↓
Update user.x and user.y
    ↓
socket.to(room).emit('cursor-move')
    ↓
canvas.js: wsManager.on('remote-cursor-move')
    ↓
updateRemoteCursor()
    ↓
Create/Update cursor indicator
    ↓
Show cursor with user name
```

### 4. History & Sync Flow
```
User A Creates Room
    ↓
Draws Circle
    ↓
Server stores in drawingHistory
    ↓
User B Joins Room
    ↓
server.js: 'join-room' event
    ↓
Send 'drawing-history' event
    ↓
canvas.js: wsManager.on('drawing-history')
    ↓
Replay all strokes on remoteCtx
    ↓
Canvas shows all previous drawings
```

---

## 📦 Data Structures

### Room Structure (Server)
```javascript
Map<roomId, {
  roomId: string,
  roomName: string,
  capacity: number,
  users: Map<socketId, {
    id: string,
    name: string,
    color: string,
    x: number,
    y: number
  }>,
  drawingHistory: [{
    fromX, fromY, toX, toY,
    color, width, tool,
    userId, timestamp
  }],
  createdAt: Date
}>
```

### Drawing Event
```javascript
{
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,      // "#RRGGBB"
  width: number,      // 1-50
  tool: string        // "brush" | "eraser" | "line"
}
```

### User Object
```javascript
{
  id: string,           // socket.id
  name: string,         // user name
  color: string,        // user color "#RRGGBB"
  x: number,           // cursor x position
  y: number            // cursor y position
}
```

---

## 🔌 WebSocket Event Protocol

### Join Room Event
```javascript
// Client → Server
socket.emit('join-room', {
  roomId: string,
  roomName: string,
  userName: string,
  userColor: string,
  capacity: number,
  isHost: boolean
})

// Server → Client (Response)
socket.emit('users-list', { users: [] })
socket.to(room).emit('user-joined', { userId, userName, userColor, users })
```

### Drawing Event
```javascript
// Client → Server
socket.emit('draw', {
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  width: number,
  tool: string
})

// Server → Room
socket.to(room).emit('draw', {
  userId: string,
  userName: string,
  fromX, fromY, toX, toY,
  color, width, tool
})
```

### Cursor Move Event
```javascript
// Client → Server
socket.emit('cursor-move', { x: number, y: number })

// Server → Room
socket.to(room).emit('cursor-move', {
  userId: string,
  userName: string,
  userColor: string,
  x: number,
  y: number
})
```

---

## 🎯 State Management

### Client-Side State
```javascript
// Canvas State
let currentTool = 'brush'
let currentColor = '#000000'
let currentStrokeWidth = 3
let isDrawing = false
let startX = 0, startY = 0

// History State
const history = []           // ImageData array
const redoStack = []         // Redo states

// User State
let currentUser = {
  name: string,
  roomId: string,
  isHost: boolean,
  color: string
}

// Remote Users State
const remoteUsers = Map     // userId → user object
```

### Server-Side State
```javascript
// Rooms State
const rooms = Map           // roomId → room object

// Per-Room State
  - users Map               // userId → user object
  - drawingHistory Array    // All strokes
  - capacity number         // Max users
```

---

## 🚀 Performance Considerations

### Frontend Optimization
1. **Canvas Redrawing**
   - Only redraw when necessary
   - Use ImageData for history
   - Separate layers for local/remote

2. **Event Throttling**
   - Cursor updates sent on every move (fine for small rooms)
   - Drawing events batched naturally by mouse movement

3. **Memory Management**
   - History limited to 50 states
   - Drawing history capped at 1000 strokes
   - Remote cursors removed on disconnect

### Backend Optimization
1. **Room Cleanup**
   - Rooms deleted when last user leaves
   - Automatic cleanup prevents memory leaks

2. **Event Broadcasting**
   - Use `socket.to(room)` for efficient delivery
   - Only send to room members

3. **Connection Management**
   - Auto-reconnection with exponential backoff
   - Max reconnection attempts: 5

---

## 🔐 Security Architecture

### Input Validation
- Client-side: Form validation
- Server-side: Data type checking
- Room capacity enforcement

### Error Handling
- Connection errors logged
- Invalid events ignored
- Room errors sent to client
- Graceful disconnection

### CORS Protection
- Express CORS middleware
- Socket.IO CORS configuration
- Same-origin recommendations

---

## 📱 Responsive Architecture

### Layout
```
Desktop (>1024px)
  ├─ Full navbar
  ├─ Horizontal toolbar
  └─ Full canvas

Tablet (768px-1024px)
  ├─ Compact navbar
  ├─ Wrapped toolbar
  └─ Responsive canvas

Mobile (<768px)
  ├─ Stacked navbar
  ├─ Vertical toolbar
  └─ Full-width canvas
```

### Touch Support
- Touch events mimic mouse events
- preventDefault() on touch move
- Mobile-friendly cursor

---

## 🔄 Scalability Considerations

### Current Limitations
- In-memory storage (no database)
- Single server instance
- Max ~100 concurrent users per instance

### Future Scalability
- Add Redis for room state
- Implement horizontal scaling
- Database persistence
- Load balancing
- Microservices architecture

---

## 📋 Event Lifecycle

### Complete User Session
```
1. Landing Page
   └─ User creates/joins room

2. WebSocket Connection
   └─ Connect and join room

3. Canvas Interaction
   ├─ Draw on canvas
   ├─ Send drawing events
   ├─ Receive remote drawings
   └─ Track cursors

4. Collaboration
   ├─ Multiple users drawing
   ├─ Real-time sync
   └─ See each other's work

5. Session End
   ├─ User clicks Leave
   └─ Disconnect WebSocket
```

---

## 🛠️ Development Workflow

### Adding New Feature
1. **Frontend**: Add UI in canvas.html
2. **Canvas Logic**: Add function in canvas.js
3. **WebSocket**: Add event in websocket.js
4. **Backend**: Add handler in server.js
5. **Testing**: Test with multiple clients

### Debugging
```
Client: Browser DevTools Console
├─ Check WebSocket connection
├─ Monitor events sent/received
└─ Inspect canvas state

Server: Node.js Console
├─ Monitor active connections
├─ Track room statistics
└─ Check error logs
```

---

## 📊 Monitoring & Debugging

### Client Debugging
```javascript
// Check WebSocket status
console.log(wsManager.isConnected)

// Monitor events
wsManager.on('any-event', (data) => console.log(data))

// Check canvas state
console.log(history, redoStack, remoteUsers)
```

### Server Debugging
```javascript
// Check active rooms
console.log(rooms)

// Monitor specific room
console.log(rooms.get(roomId))

// Check user connections
console.log(io.sockets.sockets)
```

---

## 🎯 Architecture Benefits

1. **Modularity**: Each module has single responsibility
2. **Scalability**: Easy to add features
3. **Maintainability**: Clear separation of concerns
4. **Testability**: Components can be tested independently
5. **Reusability**: WebSocket module can be reused

---

## 📚 Architecture Pattern

### Frontend Pattern
- **MVC-inspired**: Model (canvas state) → View (DOM) → Controller (handlers)
- **Event-driven**: All interactions trigger events
- **Modular**: Separate modules for canvas, WebSocket

### Backend Pattern
- **Room-based**: Organize users and data by rooms
- **Event handler**: Socket.IO event handlers
- **Broadcasting**: Server broadcasts to room members

---

**Architecture Ready for Production-Ready Enhancement** ✅
