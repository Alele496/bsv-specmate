// WebSocket push channel — runs alongside MCP stdio transport.
// Accepts connections on ws://127.0.0.1:DEFAULT_PORT, broadcasts alerts to all clients.

import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import {
  DEFAULT_PORT, HEARTBEAT_INTERVAL, MAX_QUEUE,
  heartbeatMessage,
} from './protocol.mjs';

let wss = null;
let httpServer = null;
let heartbeatTimer = null;
const alertRing = [];        // bounded ring buffer
let ringHead = 0;

// ── Lifecycle ──

export function start(port = DEFAULT_PORT) {
  if (wss) return Promise.resolve({ port, wss, status: 'already_running' });

  return new Promise((resolve, reject) => {
    httpServer = createServer();
    wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws, req) => {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      console.error(`[specmate-push] client connected: ${clientId}`);

      // Replay recent alerts (last 200, newest first then reversed to chronological)
      const recent = drainRing();
      if (recent.length > 0) {
        ws.send(JSON.stringify({ type: 'replay', ts: Date.now(), v: '0.1.0', alerts: recent }));
      }

      ws.on('close', () => {
        console.error(`[specmate-push] client disconnected: ${clientId}`);
      });

      ws.on('error', (err) => {
        console.error(`[specmate-push] client error (${clientId}):`, err.message);
      });
    });

    wss.on('error', (err) => {
      console.error('[specmate-push] server error:', err.message);
      reject(err);
    });

    httpServer.listen(port, '127.0.0.1', () => {
      console.error(`[specmate-push] push channel ws://127.0.0.1:${port}`);
      // Heartbeat
      heartbeatTimer = setInterval(() => {
        broadcastRaw(heartbeatMessage());
      }, HEARTBEAT_INTERVAL);
      heartbeatTimer.unref?.();
      resolve({ port, wss, status: 'started' });
    });

    httpServer.on('error', reject);
  });
}

export function stop() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (wss) {
    for (const ws of wss.clients) {
      ws.close(1001, 'server shutting down');
    }
    wss.close();
    wss = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

export function isRunning() {
  return wss !== null;
}

// ── Broadcast ──

function broadcastRaw(msg) {
  if (!wss) return;
  for (const ws of wss.clients) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try { ws.send(msg); } catch (_) { /* client may have disconnected */ }
    }
  }
}

/**
 * Push an alert to all connected clients and store in ring buffer.
 * @param {object} alert — { level, code, title, detail, file?, line?, suggestion? }
 */
export function push(alert) {
  const msg = JSON.stringify({ type: 'alert', ts: Date.now(), v: '0.1.0', ...alert });
  broadcastRaw(msg);
  ringPut({ type: 'alert', ...alert, ts: Date.now() });
}

export function pushMemory(memory) {
  const entry = { type: 'memory', ts: Date.now(), v: '0.1.0', ...memory };
  const msg = JSON.stringify(entry);
  broadcastRaw(msg);
  ringPut({ type: 'memory', ...entry });
}

export function pushDiff(diff) {
  const entry = { type: 'diff', ts: Date.now(), v: '0.1.0', ...diff };
  const msg = JSON.stringify(entry);
  broadcastRaw(msg);
  ringPut({ type: 'diff', ...entry });
}

// ── Ring buffer (bounded, last N alerts) ──

function ringPut(entry) {
  alertRing[ringHead % MAX_QUEUE] = entry;
  ringHead++;
}

function drainRing() {
  const total = Math.min(ringHead, MAX_QUEUE);
  if (total === 0) return [];
  const start = ringHead >= MAX_QUEUE ? ringHead % MAX_QUEUE : 0;
  const result = [];
  for (let i = 0; i < total; i++) {
    const entry = alertRing[(start + i) % MAX_QUEUE];
    if (entry) result.push(entry);
  }
  return result;
}

// ── Server info ──

export function getInfo() {
  return {
    running: wss !== null,
    port: httpServer?.address()?.port || null,
    clients: wss?.clients?.size || 0,
    queuedAlerts: Math.min(ringHead, MAX_QUEUE),
  };
}
