#!/usr/bin/env node
// Test client for specmate WS push channel.
// Usage: node scripts/ws-listen.mjs [port]
// Connects to ws://127.0.0.1:9339 (default), prints all push messages.

import WebSocket from 'ws';

const port = parseInt(process.argv[2], 10) || 9339;
const url = `ws://127.0.0.1:${port}`;

console.log(`[ws-listen] connecting to ${url} ...`);

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log(`[ws-listen] connected. waiting for push messages...\n`);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    const time = new Date(msg.ts).toLocaleTimeString();
    switch (msg.type) {
      case 'alert':
        console.log(`[${time}] 🔔 ${msg.level.toUpperCase()} ${msg.code || ''} — ${msg.title}`);
        if (msg.detail) console.log(`         ${msg.detail}`);
        if (msg.suggestion) console.log(`         💡 ${msg.suggestion}`);
        break;
      case 'memory':
        console.log(`[${time}] 🧠 MEMORY: ${msg.code} — appeared ${msg.count} times before`);
        if (msg.lastFix) console.log(`         last fix: ${msg.lastFix}`);
        break;
      case 'diff':
        console.log(`[${time}] 📊 DIFF: +${msg.added?.length || 0} new / -${msg.removed?.length || 0} resolved / ${msg.persistent?.length || 0} persistent`);
        break;
      case 'replay':
        console.log(`[${time}] 📼 REPLAY: ${msg.alerts?.length || 0} queued alerts`);
        for (const a of (msg.alerts || []).slice(0, 5)) {
          console.log(`         ${a.level || '?'} ${a.code || ''} — ${a.title || ''}`);
        }
        if (msg.alerts?.length > 5) console.log(`         ... and ${msg.alerts.length - 5} more`);
        break;
      case 'heartbeat':
        // silent
        break;
      default:
        console.log(`[${time}] ❓ ${msg.type}:`, JSON.stringify(msg).slice(0, 200));
    }
  } catch {
    console.log('[ws-listen] raw:', data.toString().slice(0, 200));
  }
});

ws.on('close', (code, reason) => {
  console.log(`\n[ws-listen] disconnected: ${code} ${reason ? reason.toString() : ''}`);
  process.exit(0);
});

ws.on('error', (err) => {
  console.error(`[ws-listen] error: ${err.message}`);
  process.exit(1);
});

// Keep alive
process.on('SIGINT', () => { ws.close(); process.exit(0); });
process.on('SIGTERM', () => { ws.close(); process.exit(0); });
