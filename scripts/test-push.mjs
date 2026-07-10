// Integration test: verify WS push channel works end-to-end.
// Starts push server, connects client, pushes alerts, verifies receipt.

import { start, stop, push, pushMemory, pushDiff, getInfo } from '../src/push/channel.mjs';
import { alertMessage, memoryMessage, diffMessage, PROTOCOL_VERSION } from '../src/push/protocol.mjs';
import WebSocket from 'ws';

const PORT = 19339; // non-default port for testing

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}

// Step 1: Start push server
console.log('1. Starting push server...');
const info = await start(PORT);
assert(info.status === 'started', 'server starts');
assert(getInfo().running === true, 'getInfo reports running');
assert(getInfo().port === PORT, `port is ${PORT}`);

// Step 2: Start again (should be idempotent)
const info2 = await start(PORT);
assert(info2.status === 'already_running', 'double start is idempotent');

// Step 3: Push some alerts before any client connects
console.log('\n2. Pushing alerts (no client yet)...');
push({ level: 'warn', code: 'TRAP', title: 'Test trap 1', detail: 'A design trap' });
push({ level: 'error', code: 'G0004', title: 'Scheduling conflict', detail: 'Rule A vs Rule B' });
pushMemory({ code: 'G0053', history: 'appeared 3 times', count: 3, lastFix: 'use mkRegU', action: 'remind' });
pushDiff({ added: [{ code: 'S0001', file: 'x.bsv', line: 1, message: 'pkg mismatch' }], removed: [], persistent: [] });
assert(getInfo().queuedAlerts >= 3, 'queued alerts accumulate');

// Step 4: Connect client (should receive replay)
console.log('\n3. Connecting client...');
const receivedMessages = [];

const ws = await new Promise((resolve, reject) => {
  const socket = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const timeout = setTimeout(() => reject(new Error('connection timeout')), 3000);

  socket.on('open', () => {
    clearTimeout(timeout);
    resolve(socket);
  });

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      receivedMessages.push(msg);
    } catch (_) {}
  });

  socket.on('error', (err) => {
    clearTimeout(timeout);
    reject(err);
  });
});

assert(getInfo().clients >= 1, 'client count >= 1');

// Step 5: Wait for replay
await new Promise(r => setTimeout(r, 500));
const replay = receivedMessages.find(m => m.type === 'replay');
assert(replay != null, 'received replay message');
assert(replay.alerts.length >= 3, `replay has ${replay.alerts?.length || 0} alerts (expected >= 3)`);

// Step 6: Push while client connected — should receive immediately
console.log('\n4. Pushing live alert...');
receivedMessages.length = 0; // clear
push({ level: 'info', code: 'INFO', title: 'Live test', detail: 'Should arrive immediately' });

await new Promise(r => setTimeout(r, 200));
const live = receivedMessages.find(m => m.type === 'alert' && m.code === 'INFO');
assert(live != null, 'live alert received by client');
assert(live.level === 'info', 'alert level is info');
assert(live.v === PROTOCOL_VERSION, `protocol version ${PROTOCOL_VERSION}`);

// Step 7: Protocol helpers
console.log('\n5. Testing protocol helpers...');
const alertMsg = alertMessage({ level: 'warn', code: 'T1', title: 'X', detail: 'D', file: 'f.bsv', line: 10, suggestion: 'try Y' });
const parsed = JSON.parse(alertMsg);
assert(parsed.type === 'alert', 'alertMessage produces alert type');
assert(parsed.code === 'T1', 'alertMessage preserves code');
assert(parsed.v === PROTOCOL_VERSION, 'alertMessage includes version');

const memMsg = memoryMessage({ code: 'G0005', history: '2x', count: 2, lastFix: 'remove attr', file: 'f.bsv' });
const parsedMem = JSON.parse(memMsg);
assert(parsedMem.type === 'memory', 'memoryMessage produces memory type');
assert(parsedMem.code === 'G0005', 'memoryMessage preserves code');

const diffMsg = diffMessage({ added: [{ code: 'X', file: 'f.bsv', line: 1, message: 'x' }], removed: [], persistent: [] });
const parsedDiff = JSON.parse(diffMsg);
assert(parsedDiff.type === 'diff', 'diffMessage produces diff type');
assert(parsedDiff.added.length === 1, 'diffMessage preserves added');

// Clean up
console.log('\n6. Cleaning up...');
ws.close();
await new Promise(r => setTimeout(r, 100));
stop();
assert(getInfo().running === false, 'server stopped');

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
