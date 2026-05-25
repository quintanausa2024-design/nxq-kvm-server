const http = require('http');
const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;

// rooms: Map<roomCode, Map<pcNumber, ws>>
const rooms = new Map();
// controlledBy: Map<roomCode, Map<pcNumber, controllerPcNumber>>
const controlled = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200); res.end('NXQ KVM OK\n');
});

const wss = new WebSocket.Server({ server });

function getRoom(code)    { if (!rooms.has(code))    rooms.set(code, new Map());    return rooms.get(code); }
function getCtrl(code)    { if (!controlled.has(code)) controlled.set(code, new Map()); return controlled.get(code); }

function forward(room, to, msg) {
  const target = room.get(to);
  if (target?.readyState === WebSocket.OPEN)
    target.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
}

wss.on('connection', (ws) => {
  let pcNumber = null;
  let roomCode = null;
  let room     = null;
  let ctrl     = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') {
      // Mantener servidor despierto — no hacer nada
      return;
    }
    if (msg.type === 'register') {
      pcNumber = msg.pcNumber;
      roomCode = (msg.roomCode || 'default').toUpperCase();
      room     = getRoom(roomCode);
      ctrl     = getCtrl(roomCode);
      room.set(pcNumber, ws);
      console.log(`[${roomCode}] PC${pcNumber} conectada | Sala: ${room.size} PCs`);
      const pcs = [...room.keys()].sort();
      ws.send(JSON.stringify({ type: 'registered', pcNumber, connectedPcs: pcs }));
      broadcast(room, { type: 'peers_update', connectedPcs: pcs });
    }

    if (!room) return;

    else if (msg.type === 'mouse_move') {
      forward(room, msg.to, { type: 'set_cursor', xPct: msg.xPct, yPct: msg.yPct });
    }
    else if (msg.type === 'mouse_button') {
      forward(room, msg.to, { type: 'mouse_button', btn: msg.btn, wheel: msg.wheel || 0 });
    }
    else if (msg.type === 'transfer') {
      ctrl.set(msg.to, pcNumber);
      forward(room, msg.to, { type: 'take_mouse', from: pcNumber, yPercent: msg.yPercent, side: msg.side });
    }
    else if (msg.type === 'release_mouse') {
      ctrl.delete(msg.to);
      forward(room, msg.to, { type: 'release_mouse', from: pcNumber });
    }
    else if (msg.type === 'steal_mouse') {
      const controller = ctrl.get(pcNumber);
      if (controller) {
        ctrl.delete(pcNumber);
        forward(room, controller, { type: 'steal_mouse', from: pcNumber });
        console.log(`[${roomCode}] PC${pcNumber} robó el mouse de PC${controller}`);
      }
    }
  });

  ws.on('close', () => {
    if (!room || pcNumber === null) return;
    // Liberar PCs que esta controlaba
    for (const [victim, controller] of ctrl.entries()) {
      if (controller === pcNumber) {
        ctrl.delete(victim);
        forward(room, victim, { type: 'release_mouse', from: pcNumber });
        console.log(`[${roomCode}] Auto-release PC${victim} por cierre de PC${pcNumber}`);
      }
    }
    room.delete(pcNumber);
    console.log(`[${roomCode}] PC${pcNumber} desconectada | Sala: ${room.size} PCs`);
    if (room.size === 0) { rooms.delete(roomCode); controlled.delete(roomCode); }
    else broadcast(room, { type: 'peers_update', connectedPcs: [...room.keys()].sort() });
  });
});

server.listen(PORT, () => console.log(`NXQ KVM Relay en puerto ${PORT}`));
