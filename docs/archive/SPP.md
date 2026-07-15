> ⚠️ **已废弃**：WebSocket 推送通道已被 MCP Notification 替代（2026-07-14 议会 S02E03）。保留作为 SPP 协议语义设计参考——alert/memory/diff 三种消息类型是当前 push/ 层的设计基础。

# specmate Push Protocol (SPP) v0.1.0

基于 WebSocket 的主动推送通道，与 MCP request-response 通道并行运行。

## 设计理念

```
MCP 通道 (stdio)           SPP 通道 (WebSocket)
─────────────────         ─────────────────────
Agent 问 → specmate 答    specmate 检测到问题 → 主动推
"纠错器"模式              "搭档"模式
```

- **MCP**：Agent 调用 specmate 工具，specmate 响应。被动。
- **SPP**：specmate 在关键事件发生时主动推送。Agent 无需轮询。

## 连接

```
ws://127.0.0.1:9339
```

- 仅监听 localhost（安全）
- 支持多客户端并发连接
- 新客户端连接时自动回放最近 200 条消息
- 每 30 秒发送心跳保持连接

## 消息格式

所有消息均为 JSON，包含公共字段：

```json
{
  "type": "<消息类型>",
  "ts": 1712345678000,
  "v": "0.1.0"
}
```

## 消息类型

### 1. alert — 通用提醒

当 specmate 检测到设计陷阱、风格问题或错误时推送。

```json
{
  "type": "alert",
  "ts": 1712345678000,
  "v": "0.1.0",
  "level": "warn",
  "code": "TRAP",
  "title": "SPI 标准是 MSB-first",
  "detail": "你的代码使用了 LSB-first 移位顺序，这与 SPI 标准不符",
  "file": "Top.bsv",
  "line": 42,
  "suggestion": "改为从 bit[7] 开始移位输出",
  "source": "guide:pre_code"
}
```

**level 取值**：
| 值 | 含义 |
|----|------|
| `info` | 可选参考 |
| `warn` | 潜在问题，建议审查 |
| `error` | 可能的 bug，编译前修复 |

**source 取值**：`guide:pre_code` | `guide:pattern` | `check_style` | `capture` | `diff` | `analyze`

### 2. memory — 项目记忆匹配

当 specmate 发现当前错误码在历史中出现过时推送。

```json
{
  "type": "memory",
  "ts": 1712345678000,
  "v": "0.1.0",
  "action": "remind",
  "code": "G0053",
  "history": "此错误码在 01-spi 项目中出现过 3 次",
  "count": 3,
  "lastFix": "将 mkReg(param) 改为 mkRegU + 显式赋值",
  "file": "Top.bsv"
}
```

### 3. diff — 编译警告变化

编译迭代中追踪 warning 增减。

```json
{
  "type": "diff",
  "ts": 1712345678000,
  "v": "0.1.0",
  "added": [{"code": "G0010", "file": "Top.bsv", "line": 43, "message": "..."}],
  "removed": [],
  "persistent": [{"code": "S0001", "file": "Top.bsv", "line": 1, "message": "..."}]
}
```

### 4. replay — 历史回放

新客户端连接时自动推送，包含连接前的缓存消息。

```json
{
  "type": "replay",
  "ts": 1712345678000,
  "v": "0.1.0",
  "alerts": [
    {"level": "warn", "code": "TRAP", "title": "..."}
  ]
}
```

### 5. heartbeat — 心跳

每 30 秒发送，无 payload。Agent 可忽略。

```json
{"type": "heartbeat", "ts": 1712345678000, "v": "0.1.0"}
```

## Agent 集成指南

### CCB Agent 集成

CCB 目前不原生支持 WebSocket 连接维护。推荐两种方式：

**方式 A — 文件桥接**（推荐，即刻可用）

运行 `scripts/ws-listen.mjs` 作为后台进程，输出写入文件：

```bash
node scripts/ws-listen.mjs >> .specmate/alerts.jsonl &
```

在 Agent 系统提示词中加入：

```
每次读取或写入 .bsv 文件后，检查 .specmate/alerts.jsonl 有无新消息。
```

**方式 B — peer agent**（更强，需要 TeamCreate）

创建一个常驻的 specmate-peer agent，维护 WS 连接，通过 SendMessage 将提醒转给编码 Agent。

### 通用 Agent 集成

任何能维护 WebSocket 连接的 Agent 都可以直接监听 SPP 消息。收到消息后：
1. `alert`：评估是否需要调整当前代码
2. `memory`：检查历史修复方案是否适用
3. `diff`：确认 warning 变化方向是否正确

## 触发条件

| 触发点 | 消息类型 | 条件 |
|--------|---------|------|
| `specmate_guide(pre_code)` | `alert` | 匹配到设计陷阱 |
| `specmate_guide(pattern)` | `alert` | 范式模板中包含陷阱 |
| `specmate_check` | `alert` | 发现风格/编码问题 |
| `specmate_capture` | `alert` | 编译错误码被记录 |
| `specmate_diff` | `diff` + `alert` | 新 warning 新增或消除 |
| `specmate_resolve` | `memory` | 错误码有历史重复记录 |

## 版本

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.1.0 | 2026-07-11 | 初始原型：alert / memory / diff / replay / heartbeat |
