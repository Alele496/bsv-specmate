/* @dormant -- kept as MCP notification infrastructure, currently unused.
 * Push flags were removed from config.mjs in Phase 1 (2026-07-12).
 * The bridge stays in place — notifications/specmate/* can be re-enabled
 * when a client demonstrates reliable MCP notification support.
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
