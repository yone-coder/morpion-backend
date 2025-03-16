const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Replace with frontend URL in production
  }
});

const port = process.env.PORT || 3001;
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('New client connected');

  // Create a new game room
  socket.on('createRoom', () => {
    const roomId = uuidv4();
    const board = Array(50).fill().map(() => Array(50).fill(null));
    rooms.set(roomId, {
      board,
      turn: 'X',
      playerX: socket.id,
      playerO: null,
      lastMove: null,
    });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
  });

  // Join an existing room
  socket.on('joinRoom', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room does not exist');
      return;
    }
    if (room.playerO) {
      socket.emit('error', 'Room is full');
      return;
    }
    room.playerO = socket.id;
    socket.join(roomId);
    io.to(roomId).emit('gameStart', { board: room.board, turn: room.turn });
    socket.emit('roomJoined', { roomId, player: 'O' });
    io.to(room.playerX).emit('roomJoined', { roomId, player: 'X' });
  });

  // Handle a player's move
  socket.on('move', ({ roomId, x, y }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.turn === 'X' && socket.id !== room.playerX) return;
    if (room.turn === 'O' && socket.id !== room.playerO) return;
    if (room.board[x][y]) return;

    room.board[x][y] = room.turn;
    room.lastMove = { x, y };
    room.turn = room.turn === 'X' ? 'O' : 'X';
    io.to(roomId).emit('boardUpdate', { board: room.board, turn: room.turn, lastMove: room.lastMove });

    const winner = calculateWinner(room.board, room.lastMove.x, room.lastMove.y, room.board[x][y]);
    if (winner) {
      io.to(roomId).emit('gameOver', { winner: winner === 'draw' ? 'draw' : room.board[x][y], reason: winner === 'draw' ? 'draw' : 'five-in-a-row' });
      rooms.delete(roomId);
    }
  });

  // Handle resignation
  socket.on('resign', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const winner = socket.id === room.playerX ? 'O' : 'X';
    io.to(roomId).emit('gameOver', { winner, reason: 'resignation' });
    rooms.delete(roomId);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms) {
      if (room.playerX === socket.id || room.playerO === socket.id) {
        io.to(roomId).emit('opponentDisconnected');
        rooms.delete(roomId);
        break;
      }
    }
  });
});

// Check for five in a row
function calculateWinner(board, lastX, lastY, lastMark) {
  const size = 50;
  const directions = [
    [0, 1],  // Horizontal
    [1, 0],  // Vertical
    [1, 1],  // Diagonal down-right
    [1, -1], // Diagonal down-left
  ];

  for (const [dx, dy] of directions) {
    let count = 1;
    for (let i = 1; i < 5; i++) {
      const newX = lastX + i * dx;
      const newY = lastY + i * dy;
      if (newX < 0 || newX >= size || newY < 0 || newY >= size || board[newX][newY] !== lastMark) break;
      count++;
    }
    for (let i = 1; i < 5; i++) {
      const newX = lastX - i * dx;
      const newY = lastY - i * dy;
      if (newX < 0 || newX >= size || newY < 0 || newY >= size || board[newX][newY] !== lastMark) break;
      count++;
    }
    if (count >= 5) return lastMark;
  }
  if (board.flat().every(cell => cell)) return 'draw';
  return null;
}

server.listen(port, () => console.log(`Server running on port ${port}`));
