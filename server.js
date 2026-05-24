const http = require('http');
const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const clients = new Map();

// Rastrear quién controla a quién: controlledBy[pc] = controllerPc
const controlledBy = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200); res.end('NXQ KVM OK\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let pcNumber = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'register') {
      pcNumber = msg.pcNumber;
      clients.set(pcNumber, ws);
      console.log(`PC${pcNumber} conectada | Total: ${clients.size}`);
      ws.send(JSON.stringify({ type: 'registered', pcNumber, connectedPcs: [...clients.keys()].sort() }));
      broadcast({ type: 'peers_update', connectedPcs: [...clients.keys()].sort() });
    }
    else if (msg.type === 'mouse_move') {
      forward(msg.to, { type: 'set_cursor', xPct: msg.xPct, yPct: msg.yPct });
    }
    else if (msg.type === 'mouse_button') {
      forward(msg.to, { type: 'mouse_button', btn: msg.btn, wheel: msg.wheel || 0 });
    }
    else if (msg.type === 'transfer') {
      controlledBy.set(msg.to, pcNumber);
      forward(msg.to, { type: 'take_mouse', from: pcNumber, yPercent: msg.yPercent, side: msg.side });
    }
    else if (msg.type === 'release_mouse') {
      controlledBy.delete(msg.to);
      forward(msg.to, { type: 'release_mouse', from: pcNumber });
    }
    else if (msg.type === 'steal_mouse') {
      // PC2 tomó el control — avisar a quien la controlaba
      const controller = controlledBy.get(pcNumber);
      if (controller) {
        controlledBy.delete(pcNumber);
        forward(controller, { type: 'steal_mouse', from: pcNumber });
        console.log(`PC${pcNumber} robó el mouse de PC${controller}`);
      }
    }
  });

  ws.on('close', () => {
    if (pcNumber) {
      // Liberar cualquier PC que estuviera siendo controlada por esta
      for (const [controlled, controller] of controlledBy.entries()) {
        if (controller === pcNumber) {
          controlledBy.delete(controlled);
          forward(controlled, { type: 'release_mouse', from: pcNumber });
          console.log(`Auto-release: PC${controlled} liberada por desconexión de PC${pcNumber}`);
        }
      }
      clients.delete(pcNumber);
      console.log(`PC${pcNumber} desconectada | Total: ${clients.size}`);
      broadcast({ type: 'peers_update', connectedPcs: [...clients.keys()].sort() });
    }
  });
});

function forward(to, msg) {
  const target = clients.get(to);
  if (target?.readyState === WebSocket.OPEN)
    target.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
}

server.listen(PORT, () => console.log(`NXQ KVM Relay en puerto ${PORT}`));
