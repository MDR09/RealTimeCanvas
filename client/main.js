// Generate random room ID
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomId = '';
    for (let i = 0; i < 12; i++) {
        roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return roomId;
}

// Switch between Create and Join modes
function switchMode(mode) {
    const createSection = document.getElementById('createSection');
    const joinSection = document.getElementById('joinSection');
    const buttons = document.querySelectorAll('.toggle-btn');

    if (mode === 'create') {
        createSection.classList.add('active');
        joinSection.classList.remove('active');
        buttons[0].classList.add('active');
        buttons[1].classList.remove('active');
    } else {
        joinSection.classList.add('active');
        createSection.classList.remove('active');
        buttons[1].classList.add('active');
        buttons[0].classList.remove('active');
    }
}

// Create Room
function createRoom() {
    const userName = document.getElementById('userName').value.trim();
    const roomName = document.getElementById('createRoomName').value.trim();
    const capacity = document.getElementById('createCapacity').value;

    // Validation
    if (!userName) {
        alert('❌ Please enter your name');
        return;
    }

    if (!roomName) {
        alert('❌ Please enter a room name');
        return;
    }

    // Generate Room ID
    const roomId = generateRoomId();

    // Display Room ID
    const displayElement = document.getElementById('createRoomId');
    displayElement.innerHTML = `✅ Room Created!<br>ID: <strong>${roomId}</strong><br>Capacity: ${capacity}`;

    // Store in localStorage
    localStorage.setItem('userName', userName);
    localStorage.setItem('roomId', roomId);
    localStorage.setItem('roomName', roomName);
    localStorage.setItem('roomCapacity', capacity);
    localStorage.setItem('isHost', 'true');

    console.log(`✅ Room Created: ${roomName} (ID: ${roomId}, Capacity: ${capacity}) by ${userName}`);

    // Auto-redirect after 1.5 seconds
    setTimeout(() => {
        window.location.href = 'canvas.html';
    }, 1500);
}

// Join Room
function joinRoom() {
    const userName = document.getElementById('userName').value.trim();
    const roomId = document.getElementById('joinRoomId').value.trim();

    // Validation
    if (!userName) {
        alert('❌ Please enter your name');
        return;
    }

    if (!roomId) {
        alert('❌ Please enter a room ID');
        return;
    }

    // Validate Room ID format
    if (roomId.length !== 12) {
        alert('❌ Invalid Room ID (must be 12 characters)');
        return;
    }

    // Store in localStorage
    localStorage.setItem('userName', userName);
    localStorage.setItem('roomId', roomId);
    localStorage.setItem('isHost', 'false');

    console.log(`✅ Joining Room: ${roomId} as ${userName}`);

    // Redirect to canvas page
    window.location.href = 'canvas.html';
}

// Enter key support
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('userName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const activeSection = document.getElementById('createSection').classList.contains('active') 
                ? 'create' 
                : 'join';
            if (activeSection === 'create') createRoom();
            else joinRoom();
        }
    });

    document.getElementById('createRoomName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') createRoom();
    });

    document.getElementById('createCapacity').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') createRoom();
    });

    document.getElementById('joinRoomId').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') joinRoom();
    });
});
