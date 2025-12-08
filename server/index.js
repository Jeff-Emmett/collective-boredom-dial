const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;

// Room storage: { roomId: { users: Map, createdAt: Date, name: string } }
const rooms = new Map();

// Global room (the default public room with bots)
const GLOBAL_ROOM_ID = 'global';

// Generate short room codes
const generateRoomCode = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
};

// Generate user ID
const generateUserId = () => crypto.randomBytes(8).toString('hex');

// Simulated users for global room
const bots = [
  { id: 'bot-restless', name: 'Restless Rita', boredom: 65, volatility: 15, speed: 3000 },
  { id: 'bot-chill', name: 'Chill Charlie', boredom: 25, volatility: 8, speed: 7000 },
  { id: 'bot-moody', name: 'Moody Morgan', boredom: 50, volatility: 25, speed: 4000 },
  { id: 'bot-sleepy', name: 'Sleepy Sam', boredom: 80, volatility: 10, speed: 10000 },
];

// Initialize global room with bots
const globalRoom = {
  users: new Map(),
  createdAt: new Date(),
  name: 'Global Boredom',
  isGlobal: true
};

bots.forEach(bot => {
  globalRoom.users.set(bot.id, {
    boredom: bot.boredom,
    ws: null,
    isBot: true,
    name: bot.name
  });
});

rooms.set(GLOBAL_ROOM_ID, globalRoom);

// Start bot simulation for global room
bots.forEach(bot => {
  setInterval(() => {
    const room = rooms.get(GLOBAL_ROOM_ID);
    if (!room) return;

    const user = room.users.get(bot.id);
    if (!user) return;

    const drift = (bot.boredom - user.boredom) * 0.1;
    const randomChange = (Math.random() - 0.5) * bot.volatility;
    user.boredom = Math.max(0, Math.min(100, user.boredom + drift + randomChange));

    broadcastToRoom(GLOBAL_ROOM_ID);
  }, bot.speed);
});

// Get room stats
const getRoomStats = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return null;

  const entries = Array.from(room.users.entries());
  const values = entries.map(([_, u]) => u.boredom);
  const count = values.length;
  const average = count > 0
    ? Math.round(values.reduce((a, b) => a + b, 0) / count)
    : 50;

  const individuals = entries.map(([id, u]) => ({
    id,
    boredom: Math.round(u.boredom),
    isBot: u.isBot || false,
    name: u.name || null
  }));

  return {
    average,
    count,
    individuals,
    roomName: room.name,
    roomId
  };
};

// Broadcast to all users in a room
const broadcastToRoom = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const stats = getRoomStats(roomId);
  const message = JSON.stringify({
    type: 'stats',
    ...stats
  });

  room.users.forEach((user) => {
    if (user.ws && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
};

// Clean up old empty rooms (except global)
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (roomId === GLOBAL_ROOM_ID) return;

    // Count real users (with websocket connections)
    const realUsers = Array.from(room.users.values()).filter(u => u.ws);

    // Remove room if empty for more than 1 hour
    if (realUsers.length === 0 && now - room.createdAt.getTime() > 3600000) {
      rooms.delete(roomId);
      console.log(`Cleaned up empty room: ${roomId}`);
    }
  });
}, 60000);

// HTTP server for health checks and room creation
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health') {
    const stats = getRoomStats(GLOBAL_ROOM_ID);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      globalUsers: stats?.count || 0
    }));
    return;
  }

  if (req.url === '/api/rooms' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const roomId = generateRoomCode();
        const roomName = data.name || `Room ${roomId}`;

        rooms.set(roomId, {
          users: new Map(),
          createdAt: new Date(),
          name: roomName,
          isGlobal: false
        });

        console.log(`Created room: ${roomId} - ${roomName}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ roomId, roomName }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/rooms/') && req.method === 'GET') {
    const roomId = req.url.split('/')[3];
    const room = rooms.get(roomId);

    if (room) {
      const stats = getRoomStats(roomId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  // Extract room ID from URL query parameter
  const url = new URL(req.url, `http://${req.headers.host}`);
  let roomId = url.searchParams.get('room') || GLOBAL_ROOM_ID;

  // Validate room exists
  if (!rooms.has(roomId)) {
    // Create room if it looks like a valid code
    if (roomId.length === 6 && /^[A-Z0-9]+$/.test(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        createdAt: new Date(),
        name: `Room ${roomId}`,
        isGlobal: false
      });
    } else {
      roomId = GLOBAL_ROOM_ID;
    }
  }

  const room = rooms.get(roomId);
  const userId = generateUserId();

  // Get name from query or generate
  const userName = url.searchParams.get('name') || null;

  // Add user to room
  room.users.set(userId, {
    boredom: 50,
    ws,
    isBot: false,
    name: userName
  });

  console.log(`User ${userId} joined room ${roomId}. Users in room: ${room.users.size}`);

  // Send welcome message
  const stats = getRoomStats(roomId);
  ws.send(JSON.stringify({
    type: 'welcome',
    userId,
    roomId,
    roomName: room.name,
    boredom: 50,
    ...stats
  }));

  // Broadcast updated stats
  broadcastToRoom(roomId);

  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'update' && typeof message.boredom === 'number') {
        const boredom = Math.max(0, Math.min(100, Math.round(message.boredom)));
        const user = room.users.get(userId);
        if (user) {
          user.boredom = boredom;
          broadcastToRoom(roomId);
        }
      }

      if (message.type === 'setName' && message.name) {
        const user = room.users.get(userId);
        if (user) {
          user.name = message.name.slice(0, 20);
          broadcastToRoom(roomId);
        }
      }
    } catch (err) {
      console.error('Invalid message:', err.message);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    room.users.delete(userId);
    console.log(`User ${userId} left room ${roomId}. Users in room: ${room.users.size}`);
    broadcastToRoom(roomId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${userId}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`Boredom Dial server running on port ${PORT}`);
  console.log(`Global room initialized with ${bots.length} bots`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  wss.clients.forEach((client) => client.close());
  server.close(() => process.exit(0));
});
