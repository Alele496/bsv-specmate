// specmate Push Protocol (SPP) v0.1.0
//
// 基于 WebSocket 的主动推送通道，与 MCP request-response 通道并行运行。
// MCP 负责 "Agent 问 → specmate 答"，SPP 负责 "specmate 检测到问题 → 主动推"。
//
// 消息格式:
//   { type: string, ts: number, ... }
//
// 消息类型:
//   alert     — 通用提醒（设计陷阱、风格警告、错误预警）
//   memory    — 项目记忆匹配提醒（历史错误复现预警）
//   diff      — 编译 warning 变化通知
//   heartbeat — 心跳（每 30s，保持连接活性）

export const PROTOCOL_VERSION = "0.1.0";
export const DEFAULT_PORT = 9339;
export const HEARTBEAT_INTERVAL = 30_000;
export const MAX_QUEUE = 200;

/**
 * Alert levels: info, warn, error
 * info  = FYI, informative
 * warn  = potential issue, should review
 * error = likely bug, fix before compile
 */
export const Level = Object.freeze({
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
});

/**
 * Build a standard message envelope.
 */
function envelope(type, payload) {
  return JSON.stringify({ type, ts: Date.now(), v: PROTOCOL_VERSION, ...payload });
}

/** Generic alert message */
export function alertMessage({ level, code, title, detail, file, line, suggestion }) {
  return envelope("alert", { level, code, title, detail, file, line, suggestion });
}

/** Project memory match — "you've seen this before" */
export function memoryMessage({ code, history, count, lastFix, file }) {
  return envelope("memory", { action: "remind", code, history, count, lastFix, file });
}

/** Warning diff notification */
export function diffMessage({ added, removed, persistent }) {
  return envelope("diff", { added, removed, persistent });
}

/** Heartbeat */
export function heartbeatMessage() {
  return envelope("heartbeat", {});
}
