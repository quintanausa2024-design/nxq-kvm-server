const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const clients = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('NXQ KVM Relay OK\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  let pcNumber = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'register') {
      pcNumber = msg.pcNumber;
      clients.set(pcNumber, ws);
      console.log(`PC${pcNumber} conectada | Total: ${clients.size}`);
      ws.send(JSON.stringify({ type: 'registered', pcNumber, connectedPcs: [...clients.keys()].sort() }));
      broadcast({ type: 'peers_update', connectedPcs: [...clients.keys()].sort() });
    }
    else if (msg.type === 'transfer') {
      const target = clients.get(msg.to);
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({ type: 'take_mouse', from: pcNumber, yPercent: msg.yPercent, side: msg.side }));
        console.log(`Mouse: PC${pcNumber} → PC${msg.to}`);
      } else {
        ws.send(JSON.stringify({ type: 'take_mouse', from: 0, yPercent: 0.5, side: msg.side === 'left' ? 'right' : 'left' }));
      }
    }
  });

  ws.on('close', () => {
    if (pcNumber) {
      clients.delete(pcNumber);
      console.log(`PC${pcNumber} desconectada | Total: ${clients.size}`);
      broadcast({ type: 'peers_update', connectedPcs: [...clients.keys()].sort() });
    }
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
}

server.listen(PORT, () => {
  console.log(`NXQ KVM Relay corriendo en puerto ${PORT}`);
});
