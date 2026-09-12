const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

app.use(express.static(path.join(__dirname, 'public')));

// code -> { participants: Map<socketId, { name }>, emptyTimer }
const rooms = new Map();

// Tempo que um grupo vazio sobrevive esperando alguém voltar (ex.: F5)
const EMPTY_ROOM_TTL = 60_000;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  name = String(name || '').trim().slice(0, 24);
  if (!name) return 'Anônimo';
  return name[0].toUpperCase() + name.slice(1).toLowerCase();
}

io.on('connection', (socket) => {
  function joinRoom(code, name, cb) {
    const room = rooms.get(code);
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
    }
    const peersList = Array.from(room.participants.entries()).map(([id, p]) => ({ id, name: p.name }));
    room.participants.set(socket.id, { name });
    socket.join(code);
    socket.data.code = code;
    socket.data.name = name;
    socket.to(code).emit('peer-joined', { id: socket.id, name });
    cb({ code, peers: peersList });
  }

  socket.on('create-room', (name, cb) => {
    if (typeof cb !== 'function') return;
    if (socket.data.code) return cb({ error: 'Você já está em um grupo.' });
    const code = genCode();
    rooms.set(code, { participants: new Map(), emptyTimer: null });
    joinRoom(code, cleanName(name), cb);
  });

  socket.on('join-room', ({ code, name } = {}, cb) => {
    if (typeof cb !== 'function') return;
    if (socket.data.code) return cb({ error: 'Você já está em um grupo.' });
    code = String(code || '').trim().toUpperCase();
    if (!rooms.has(code)) return cb({ error: 'Grupo não encontrado. Confira o código.' });
    joinRoom(code, cleanName(name), cb);
  });

  // Relay de ofertas/respostas/candidatos ICE entre dois peers
  socket.on('signal', ({ to, data } = {}) => {
    if (!to || !data) return;
    const code = socket.data.code;
    const room = code && rooms.get(code);
    if (!room || !room.participants.has(to)) return; // só relay dentro do mesmo grupo
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Estado de mídia (mic/câmera/tela) — broadcast pro grupo ou direto pra um peer
  socket.on('media-state', ({ to, state } = {}) => {
    const code = socket.data.code;
    if (!code || !state) return;
    const payload = { peerId: socket.id, state };
    if (to) {
      const room = rooms.get(code);
      if (room && room.participants.has(to)) io.to(to).emit('media-state', payload);
    } else {
      socket.to(code).emit('media-state', payload);
    }
  });

  function leave() {
    const code = socket.data.code;
    if (!code) return;
    const room = rooms.get(code);
    if (room) {
      room.participants.delete(socket.id);
      socket.to(code).emit('peer-left', { id: socket.id });
      if (room.participants.size === 0) {
        // grupo vazio: espera 1 min antes de resetar, pra sobreviver a um F5
        room.emptyTimer = setTimeout(() => rooms.delete(code), EMPTY_ROOM_TTL);
      }
    }
    socket.leave(code);
    socket.data.code = null;
  }

  socket.on('leave', leave);
  socket.on('disconnect', leave);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`RobertoScreen rodando em http://localhost:${PORT}`);
});
