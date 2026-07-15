# 深度审查报告 — 2026-07-15

> 审查对象：三轮改动 `1dbb5d3`、`22afd56`、`f57d4ff`
> 审查模式：Council — 安全/性能/规范三线并行
> 结论：**不阻断**，6 个轻微问题已记录至 project-memory.md P2 节

---

## 审查范围

| Commit | 描述 |
|--------|------|
| `1dbb5d3` | feat(db): ensureDB 自动 seed — 消除手动 db:seed 依赖 |
| `22afd56` | fix(specmate): capture/check 去重 + session 管理 + 自动 seed 修复 |
| `f57d4ff` | feat(specmate): P1 统计指标嵌入 capture/resolve 响应 |

---

## 安全线审查

### 发现 1: `autoSeedIfEmpty` 缺少文件数量/大小上限（低）

- **文件**: `src/db/query.mjs` — `autoSeedIfEmpty()`
- **问题**: 遍历 `docs/errors/*.md` 全部文件并全量读入内存，无文件数量或总大小上限
- **风险**: 当前 26 个 .md 文件没问题，但如果目录被意外填充大量文件会 OOM
- **建议**: 加 `MAX_SEED_FILES` 上限（如 100）和/或单文件大小上限（如 50KB）
- **追踪**: P2-6

### 发现 2: `specmate_capture` 未对其 `files` 参数做路径校验（低）

- **文件**: `bin/server.mjs` — `specmate_capture` handler（第 220-299 行）
- **问题**: `files` 参数直接使用，未调用 `validateFilePaths()`
- **对比**: `specmate_check`（第 132 行）和 `specmate_analyze`（第 351 行）都有路径校验
- **风险**: 相对路径传入不会报错，Agent 可能误以为文件已被记录，实际未生效
- **建议**: 在 capture handler 中对 `files` 参数加 `validateFilePaths()` 调用
- **追踪**: P2-7

---

## 性能线审查

### 发现 3: `saveDB` 高频全量写盘（低）

- **文件**: `src/db/query.mjs` — `saveDB()`
- **问题**: `saveDB()` 在多个 handler 中各自调用，每次全量序列化 SQLite 到文件
- **影响**: 当前低频调用（每天几十次）影响不大，但随调用量增长会成为瓶颈
- **建议**: 将来在 handler 末尾聚合一次 flush，减少磁盘 I/O
- **追踪**: P2-8

---

## 规范线审查

### 发现 4: `endSession()` 定义但从未调用 — 死代码（低）

- **文件**: `src/db/schema.mjs` — `endSession()`
- **问题**: 函数已定义但 `server.mjs` 中无任何引用，session 的 `ended_at` 字段永远不会被写入
- **建议**: 在合适的时机（服务器关闭 / 任务结束信号）调用，或评估是否可移除
- **追踪**: P2-3

### 发现 5: `specmate_resolve` 修复率直接拼在句号后，缺分隔符（低）

- **文件**: `bin/server.mjs` 第 337 行
- **问题**: `✅ ${code} 已标记为已解决。${fixRateBlock}` — `fixRateBlock` 直接拼接无空格或换行
- **效果**: `fixRateBlock` 非空时显示为"已标记为已解决。修复率: 3/5 (60.0%)"，句号后无视觉分隔
- **建议**: 在 `fixRateBlock` 前加 `\n` 换行符
- **追踪**: P2-4

### 发现 6: commit `22afd56` Co-Authored-By 不一致（低）

- **问题**: `22afd56` 尾部署名为 `Co-Authored-By: deepseek-v4-pro`
- **对比**: `1dbb5d3` 和 `f57d4ff` 使用 `Co-Authored-By: 台阁 <armada@bsv-agent>`
- **影响**: 纯美学，不影响功能，但不符项目统一的提交规范（CLAUDE.md 第 30 行约定）
- **建议**: 不在意的话可以不修；下次 rebase 时统一
- **追踪**: P2-5

---

## 汇总

| # | 线 | 严重度 | 问题 | 追踪 |
|---|------|--------|------|------|
| 1 | 安全 | 低 | `autoSeedIfEmpty` 缺文件/大小上限 | P2-6 |
| 2 | 安全 | 低 | `specmate_capture` 缺路径校验 | P2-7 |
| 3 | 性能 | 低 | `saveDB` 高频全量写盘 | P2-8 |
| 4 | 规范 | 低 | `endSession()` 死代码 | P2-3 |
| 5 | 规范 | 低 | `specmate_resolve` 分隔符缺失 | P2-4 |
| 6 | 规范 | 低 | `22afd56` Co-Authored-By 不一致 | P2-5 |

**裁定**: 全部 6 个问题为轻微等级，不阻断合并。已记录至 `project-memory.md` P2 节，待下次议会讨论优先级和修复顺序。

---

## 议会待议事项

- [ ] 确定 P2-3 至 P2-8 的修复优先级
- [ ] P2-7（capture 路径校验）和 P0（MCP 工具相对路径静默失败，已记录）的关联——是否在同一轮修复
- [ ] P2-8（saveDB 聚合写盘）与知识系统优化 P0-1（session 管理）的耦合评估
