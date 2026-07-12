/* @deprecated — Phase 1 (2026-07-12)
 * MCP notification bridge is deprecated alongside SPP push protocol.
 * Notifications/specmate/* messages are no longer sent since push flags
 * were removed from config.mjs. The bridge is kept as infrastructure
 * but is effectively dormant in the current architecture.
 *
 * New architecture: CLI stdout + MCP response text as primary delivery channels.
 */

// MCP notification bridge — stores McpServer reference and exposes type-safe send functions

let _server = null;

export function init(server) {
  _server = server;
}

function send(method, params) {
  if (!_server) return; // silently drop if not initialized (e.g. before server.connect)
  _server.notification({ method, params }).catch(() => {});
}

export function sendAlert(alert) {
  send('notifications/specmate/alert', alert);
}

export function sendMemory(memory) {
  send('notifications/specmate/memory', memory);
}

export function sendDiff(diff) {
  send('notifications/specmate/diff', diff);
}
