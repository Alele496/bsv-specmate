# specmate 架构决策文档

> 最后一次重大架构决策：2026-07-12
> 此文档记录已确定的架构决策。执行状态和进行中的工作见 project-memory.md

## 定位

specmate 是 **BSV 编码全周期平台**——不是"Agent 的可选顾问"，不是"bsc 的包装器"，而是 Agent 开发 BSV 的唯一检查/编译入口。

Agent 不需要知道 bsc 怎么用——它只需要知道 specmate scan（检查）和 specmate compile（生成 Verilog）。bsc 是 specmate 内部的实现细节。

## 核心架构

specmate 通过三个层次向 Agent 交付能力：

| 层次 | 通道 | Agent 感知 | 作用 |
|------|------|-----------|------|
| L0 | Agent system prompt | 始终在线 | 5 条通用硬约束（~500 tokens），Agent 不需要查询就知道 |
| L1 | CLI（npx specmate scan/check/compile） | Bash 调用 | 主通道。Agent 写代码后运行 scan 检查，通过后 compile 生成 |
| L2 | MCP stdio（specmate_analyze/resolve） | 交互式查询 | 辅助。Agent 遇到复杂调度冲突或需要深入分析时使用 |

## 交互模型

Agent 的标准 BSV 开发工作流（由 bench scaffold 注入 Agent prompt）：

1. 理解任务 → 写 .bsv 文件
2. 运行 `specmate scan <文件>` 检查
3. 修复 scan 报告的所有问题
4. 重新 scan 直到通过
5. 运行 `specmate compile <文件>` 生成 Verilog

**这是 Agent 唯一的检查/编译路径**——bench scaffold 不暴露 bsc，只暴露 specmate。

## 组件边界

### CLI 工具（bin/）
- `specmate scan` — 全面检查（语法 + 陷阱 + 范式 + DECISIONS）
- `specmate check` — 快速静态检查
- `specmate compile` — scan 通过后调 bsc 生成（远期）

### MCP Server（bin/server.mjs, stdio 传输）
- `specmate_scan` — CLI scan 的 MCP 等价物
- `specmate_analyze` — 交互式深度分析（调度冲突、依赖图等）
- `specmate_resolve` — 错误经验固化

### 知识引擎（src/tools/）
- `_matcher.mjs` — 30 个 GRAPH 领域节点，关键词+语义陷阱匹配
- `_patterns.mjs` — 15 个 BSV 代码范式骨架
- `preflight.mjs` — AST 语法扫描（tree-sitter-bsv）
- `specmate_guide.mjs` — scan 的统一响应组装
- `check_style.mjs` — 静态代码风格检查
- `ast_query.mjs` — tree-sitter AST 查询引擎

### 数据层（data/ + src/db/）
- `knowledge.db` — SQLite，errors 表 + captures 表
- `docs/errors/` — 16+ 错误码 Markdown 文档
- `dist/specmate-knowledge.md` — 知识快照（CLI 导出）

### Agent Prompt 模板（specmate_bench/）
- L0 硬约束：P0005、P0030、Bool/Bit#(1)、Vector 构造、no_implicit_conditions
- bench scaffold 将 L0 注入 Agent system prompt
- scaffold 预置 specmate CLI 到任务工作区

## 技术选型

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | Node.js | tree-sitter-bsv 绑定成熟 |
| CLI 分发 | npm + npx | 零配置，npx specmate scan 即用 |
| MCP 传输 | stdio（非 HTTP） | CCB 原生支持，无网络依赖 |
| 持久化 | SQLite (sql.js) | 单文件，零运维 |
| AST 解析 | tree-sitter-bsv | 最成熟的 BSV 语法解析器 |
| Agent 交互主通道 | CLI（Bash 调用）| Agent 无法跳过，和调 bsc 一样自然 |

## 明确不做的事

- ❌ HTTP server / localhost 端口 —— 不做。Agent 不需要手动启动服务
- ❌ daemon 常驻进程 —— 不做。不增加运维负担
- ❌ SPP 推送协议 —— 废弃。信息通过 CLI 输出和 MCP 响应直接传达
- ❌ bsc wrapper —— 不做。specmate 是独立的检查平台，不包装 bsc
- ❌ CCB Gate（内置机制）—— 搁置。等生态成熟或 fork 稳定后考虑
- ❌ kova 运行时 —— 搁置。specmate 效果验证后再决策

## 演进方向

### 近期（1-3 个月）
- 30 个 GRAPH 节点补全 style/pattern（当前 15 个缺失）
- AST 扫描从 5 条扩展到 10+ 条规则
- captures 由 scan 自动驱动（不再需要 Agent 主动调 capture）

### 中期（3-6 个月）
- 类型检查能力（interface 匹配、类型参数验证）
- DECISIONS 预计算嵌入 scan 输出
- 嵌入驱动的语义陷阱匹配（替换纯关键词匹配）

### 远期（6 个月+）
- 完整 BSV 前端检查（语法+类型+调度+综合）
- API 部署模式（团队共享 captures 知识库）
- kova 运行时评估（如果 specmate 效果显著）

## 相关文档

- `project-memory.md` — 当前执行状态、进行中的工作
- `D:/Desktop/bsv-agent/specmate_bench/CLAUDE.md` — bench 实验平台
- `D:/Desktop/kova/CLAUDE.md` — kova 知识引擎（远期）
