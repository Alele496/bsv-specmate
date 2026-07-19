# specmate 项目记忆

> 最后更新：2026-07-18（Q3+Q4 路线图全部完成 — MCP Elicitation + BSC Orchestration + 未知错误 LLM 分析 + Streaming 流式输出 + MCP Registry 注册）
> 维护者：specmate 负责人 + ops

## 项目背景

### 三大支柱愿景（2026-07-12 确立）

用户明确了方向：**先把下面三点抓好，其他功能优化都往后排。**

---
### 支柱 1：明确 specmate vs bsc 的分工

**问题**：specmate 有三个差异化能力（预编译拦截、设计决策、跨 rule 冲突分析），但当前都是"有但没用上"。

#### 1a. 预编译拦截 — preflight AST 扫描

**现状**：`preflight.mjs` 能扫 5 种模式（P0030/P0005/T0043/G0053/G0005），但 Agent 不调 `specmate_check` 或 `preflight()` 这个能力就是空气。`specmate_guide(pre_code)` 里有文字提示"建议检查已有代码"但埋在一堆输出中，Agent 经常忽略。

**改进方案（已实施）**：
- `specmate_guide(pre_code)` 新增 `file` 可选参数
- Agent 传入 `.bsv` 文件路径 → specmate 在响应中直接嵌入 AST 扫描结果
- 不再只是"建议去检查"——检查结果已经在 Agent 眼前
- **改的文件**：`bin/server.mjs`（加 file 参数到工具定义）、`src/tools/specmate_guide.mjs`（preCode 接受 file 参数，调 preflight 并嵌入结果）
- **预期效果**：Agent 调 `specmate_guide(pre_code, file="MyModule.bsv")` 时直接看到 AST 扫描出的问题，不需额外调用 `specmate_check`

**后续改进方向**：
- `preflight.mjs` 的 `scanAST()` 目前只扫 5 种模式，可扩展到 preflight 的 `COMMON_WARNINGS` 中的跨 rule 数据传递、跨模块调度标注等检查
- 探索让 preflight 支持多文件（Agent 一次传接口文件+实现文件）

#### 1b. 设计决策 — decide phase

**现状**：`decide()` 只有 5 个硬编码 if-else，覆盖面极窄。Agent 问"PipelineFIFO vs LFIFO" 或 "StmtFSM vs 手写" 无法匹配。

**改进方案（已实施）**：
- 将 `decide()` 从 5 个 if-else 扩展为 `DECISIONS` 查找表（10 个决策条目）
- 每个条目用关键词数组匹配（所有关键词都出现才命中）
- 新增的决策包括：FIFO 变体选择、mkRegFile vs mkRegFileFull、StmtFSM vs 手写 state register、跨时钟域方案、Bool vs Bit#(1) 选型、流水线级间数据传递方案
- Fallback 到 GRAPH 节点匹配 → 显示相关 reference topics
- **改的文件**：`src/tools/specmate_guide.mjs`（重写 decide 函数）
- **预期效果**：覆盖 BSV 开发中最常见的设计抉择，decide phase 从"几乎没用"变为"覆盖 80% 常见选型"

**后续改进方向**：
- `DECISIONS` 表目前是纯静态文本，未来可以让每个决策条目关联 GRAPH 节点，动态拉取对应陷阱
- 考虑 AI 辅助生成对比表格（当 DECISIONS 表未命中时，用模板 + GRAPH 数据自动生成）

#### 1c. 跨 rule 冲突分析 — specmate_analyze

**现状**：`specmate_analyze` 能力最强（调度冲突矩阵、跨 rule 冲突、依赖图、调用图等 10+ 种分析），但 0 调用。pre_code 里有文字提示但只在检测到 schedule/rule 关键词时才出现。

**改进方案（已实施）**：
- pre_code 输出的 NEXT STEPS 区块中自动包含 analyze 建议（当检测到 schedule/rule/method/regfile/arbiter 关键词时）
- NEXT STEPS 区块结构化、位置固定（在响应末尾）——Agent 不会漏看
- **改的文件**：`src/tools/specmate_guide.mjs`（preCode 末尾 NEXT STEPS 区块）
- **预期效果**：每次涉及 rule/调度的任务，Agent 都被提醒"写完 rule 后调 specmate_analyze"

**后续改进方向**：
- `specmate_analyze` 本身需要增强 READ AFTER WRITE (RAW) 冲突检测——当前只检测 WAW 和 resource 冲突，因为 tree-sitter 不支持区分寄存器读取
- 考虑让 analyze 在 `develop` 模式下自动推结果（当前只在 `tapeout` 模式 `pushAnalyze: true`）

---
### 支柱 2：主动推送要有阶段感知

**问题**：SPP（Specmate Push Protocol）基于关键词全量推送。Agent 在琢磨 SPI 控制器架构时收到"Bit#(1) 不用 Bool"就是干扰。

#### 改进方案（已实施）

**阶段定义**：
- `design` — 架构/设计阶段（模块选型、接口定义、时钟方案、互联拓扑）
- `code` — 编码/实现阶段（写 rule/method、处理类型、语法细节）

**阶段推断**（`inferPhase()` in `_matcher.mjs`）：
- 输入包含"架构/设计/接口/模块划分/时钟方案/拓扑/FIFO/选型/对比/vs" → `design` 阶段
- 其他 → `code` 阶段（默认）

**陷阱分级**（所有 22 个 GRAPH 节点 + UNIVERSAL_TRAPS 都已加 `phase` 标签）：
- `design` 陷阱：FIFO 选型、流水线拓扑、时钟域方案、BRAM 类型选择、调度策略、中断/GPIO 架构
- `code` 陷阱：P0005/P0030 语法约束、Bool/Bit 操作符、method 顺序、字面量位宽、struct/union 构造
- `both` 陷阱：（暂无，预留）

**两处生效**：
1. **响应内过滤**：`specmate_guide(pre_code)` 输出的 traps 按阶段过滤（`filterTrapsByPhase()`）
2. **推送过滤**：`onPreCode()` push notification 按阶段过滤

**改的文件**：
- `src/tools/_matcher.mjs` — 所有 trap 加 `phase` 字段 + `inferPhase()` + `filterTrapsByPhase()`
- `src/tools/specmate_guide.mjs` — preCode 使用 `filterTrapsByPhase()` 替代 `filterTrapsByMode()`
- `src/push/alerts.mjs` — `onPreCode()` 加 phase gate
- `bin/server.mjs` — push 时传递 trap phase 信息

**预期效果**：
- Agent 说"写 SPI 控制器" → 推断为 `design` 阶段 → 只推 SPI/clock/reset/FIFO 架构级陷阱
- Agent 说"写 method 实现" → 推断为 `code` 阶段 → 推 Bool/Bit 区分、method 顺序等语法陷阱
- Agent 不再被跨阶段的陷阱干扰

**局限**：
- `inferPhase()` 是关键词匹配，可能误判。例如"写 pipeline 的 method 实现"会被判为 design（包含 pipeline）。这是可接受的保守策略——在 design 阶段漏推架构陷阱比在 code 阶段推语法陷阱更危险。
- 没有明确的"阶段切换"信号——Agent 可能从架构直接跳到编码而不重新调 pre_code。当前策略是每次 pre_code 调用独立推断阶段。

---
### 支柱 3：specmate 必须自己主动，但不打断 Agent 主线

**问题**：Agent 不会主动调 specmate。specmate 必须在 Agent 写代码的过程中自己发声。但发声不能打断主线。

#### 当前推送机制的三个根本问题

**问题 A：Agent 能看到 MCP notification 吗？**

specmate 的 SPP 推送用的是 MCP notification 机制（`notifications/specmate/alert`）。这依赖两件事：
1. specmate 服务器能发出 notification（已实现，通过 `_server.notification()`）
2. Agent 客户端能接收并显示 notification

**当前状态**：不确定 Claude Code (CCB) 是否会显示 MCP notification 给 Agent。如果 CCB 不显示 notification，SPP 就是死空气——通知发出了但没人看到。

**临时对策（已实施）**：把所有关键信息嵌入到 `specmate_guide` 的 **响应正文** 中——这是 Agent 100% 能看到的地方：
- preflight 结果直接嵌入 pre_code 响应（而非单独推送）
- 阶段感知的陷阱直接嵌入响应
- NEXT STEPS 区块在响应末尾

**问题 B：推送时机**

当前只在 Agent 调用 specmate 工具时触发推送。Agent 不调 = 不推送。

**后续改进方向**：
- 探索"文件监控"模式——specmate 监视 Agent 正在编辑的 .bsv 文件，检测到写入后自动推送 preflight 结果
- 这需要 specmate 能感知文件变更，当前没有这个能力
- 短期替代方案：在 `specmate_check` 响应中强化 "NEXT STEPS"

**问题 C：推送的可见性**

工具响应正文（`text` 字段）和 notification 是两条不同的通道：
- Response text：Agent 100% 看到
- MCP notification：依赖客户端支持

**决策**：优先使用 response text 通道。notification 作为补充（对支持它的客户端生效）。

#### 改进方案（已实施）

**Pillar 3 核心策略：主动但不打断 = 把信息写进 Agent 一定会看的 response 里。**

1. **pre_code 响应中嵌入 preflight 扫描结果**（已在支柱 1a 实施）
   - Agent 调 specmate_guide → 响应里直接有 AST 扫描出的问题
   - 不需要 Agent 额外调用 specmate_check

2. **pre_code 响应末尾加 NEXT STEPS 区块**（已在支柱 1c 实施）
   - 结构化、位置固定、容易扫读
   - 包含：decide 提示、check 建议、analyze 建议（按情境）

3. **phase 过滤让每一次互动都精准**（已在支柱 2 实施）
   - 不该推的不推 = 推了的都是该看的 = Agent 不会养成"忽略推送"的习惯

**改的文件**：
- `src/tools/specmate_guide.mjs` — `preCode()` 中的 preflight 嵌入 + NEXT STEPS 区块
- `bin/server.mjs` — `specmate_guide` 描述中提示 file 参数可获取 preflight 结果

**后续改进方向**：
- 验证 MCP notification 在 CCB 中的可见性。如果可见 → `develop` 模式下可谨慎开启 `pushAnalyze`（当前仅 tapeout 开启），让调度冲突分析能主动推送
- 考虑在 preflight 发现严重问题时（如 P0005），在 specmate_guide 响应中用更醒目的标记（如 `### ⚠⚠⚠ 致命问题`）

---
### 三大支柱实施状态

| 支柱 | 改动 | 文件 | 状态 |
|------|------|------|------|
| 1a 预编译拦截 | pre_code 接受 file 参数，嵌入 preflight 结果 | `specmate_guide.mjs`, `server.mjs` | ✅ 已实施 |
| 1b 设计决策 | decide() 从 5 个 if-else 扩展为 10 条 DECISIONS 查找表 | `specmate_guide.mjs` | ✅ 已实施 |
| 1c 跨 rule 冲突 | NEXT STEPS 区块含 analyze 建议 | `specmate_guide.mjs` | ✅ 已实施 |
| 2 阶段感知 | 所有 trap 加 phase 标签 + inferPhase() + 两处过滤 | `_matcher.mjs`, `specmate_guide.mjs`, `alerts.mjs`, `server.mjs` | ✅ 已实施 |
| 3 主动不打断 | preflight 结果嵌入响应 + NEXT STEPS + phase 过滤 | `specmate_guide.mjs`, `server.mjs` | ✅ 已实施 |

### specmate 存在的必要性（根本定位问题）

**这不是一个自洽的问题——这是一个必须用具体场景回答的问题。**

#### specmate 和 bsc 编译器的本质区别

bsc 编译器告诉你 **WHAT**（什么错了：错误码 + 行号 + 错误描述）。specmate 告诉你 **WHY**（为什么错：根因分析）和 **HOW**（怎么修：具体代码级别的 before/after 方案）。

Agent 自己能跑 bsc 看报错。但 Agent 不理解 BSV——它的训练数据里 BSV 是噪声级别。Agent 看到 P0005 "function is reserved word" 时会做的事情：重命名、换语法、随机尝试——它根本不知道这背后是 Verilog-2001 模式冲突，不知道 `\\== (1)` 部分应用语法。

**具体场景**：Agent 写 `genWith(function(Integer i); return requests[i]; endfunction)`。bsc 报 P0005。Agent 可能尝试删掉 function 关键字、改成其他命名、或者换一种写法——结果都错。specmate 告诉它：function 在 V2K 模式是保留字，用 `genWith(requests, \\== (1))` 部分应用替代。

**specmate 不是弱化版 bsc。specmate 是 BSV 老工程师坐在 Agent 旁边。** bsc 是编译器——检查语法和类型。specmate 是经验层——告诉 Agent "别这么写，我在这个坑里摔过 47 次，应该这么写"。

#### 9pp 差距（45.5% vs 36.4%）说明了什么

45.5% 不够好。但问题不是 specmate 没用——问题是 Agent B **不怎么用 specmate**。P0-2 明确记录了：Agent B 理解了 specmate 的建议后，"用自己的方式实现"——手写 findFirst 代替 findIndex，引入 specmate 不知道的 P0030。这是调用率问题，不是知识质量问题。

盲审数据：Agent B 的代码质量 24/30 vs Agent A 20/30。specmate 的高层设计指导生效了——代码更优雅。但缺少编译前实际代码检查（Sprint 1 的 preflight AST 集成正是为了解决这个）。

**specmate 的复合价值不是一次实验能体现的**：错误数据库的命中计数会随使用量增长，每多一次 resolve 知识库就强一分。这是 specmate 和静态文档的根本区别。

#### 如果 specmate 只是个"弱化版 bsc + 知识库"，那它确实没存在必要。但它不是。

specmate 的核心价值是三层：
1. **预编译拦截（preflight）**：不跑 bsc 就能发现 P0030/P0005/T0043/G0053/G0005 五种高频错误。跑一次 bsc 的时间够 preflight 扫 20 个文件。
2. **错误解释（on_error）**：bsc 给你一个错误码。specmate 给你现象、根因、解决方案、相关参考文档、AST 上下文。Agent 从"这什么意思"到"知道怎么修了"。
3. **设计决策（decide）**：mkFIFO vs mkBypassFIFO、Reg vs ConfigReg、Wire vs Reg——这些不是语法问题，是架构选择。bsc 不管这个。

### 主动性 vs 干扰性（推送机制的根本问题）

**用户说得对：Agent 在写 SPI 控制器架构时，推 "Bit#(1) 不要用 Bool" 就是干扰。**

#### SPP 推送当前推送了什么

推送由 `src/push/alerts.mjs` 驱动，通过 `src/notify.mjs` 的 MCP notification 机制（`notifications/specmate/alert`、`notifications/specmate/memory`、`notifications/specmate/diff`）发送。

当前 `develop` 模式（默认）下只推一种：`pushPreCode`——当 Agent 调 specmate_guide(pre_code) 或 specmate_guide(pattern) 时，从关键词匹配到的陷阱中取前 5 条推送。

#### 推送的时机对吗？不对。

推送时机由关键词匹配触发，完全不知道 Agent 处于什么阶段。Agent 说"写 SPI 控制器"，关键词匹配到 spi、fifo、regfile、types——然后推送 5+ 条陷阱，从编译硬约束到代码风格全混在一起。Agent 还在想"我需要几个移位寄存器、SCK 极性怎么配"，收到 "Bool 用 ! 不用 ~"——这是噪音。

**根本问题：specmate 不知道 Agent 的设计阶段。** 没有"架构阶段"和"实现阶段"的区分。所有陷阱按 severity 分级（hard/quality/style），但 severity 和设计阶段无关——P0005 是 hard 级别，对任何阶段都是 hard，但在架构阶段就是不该推。

#### 推的是帮 Agent 完成用户任务，还是把 Agent 带偏去扣 BSV 语法？

当前状态：推的既有设计级陷阱（G0010 跨 rule 数据传递、FIFO 选型），也有语法级陷阱（Bool 不用 ~、字面量不超位宽）。Agent 分不清哪些是"现在必须考虑的"哪些是"写代码时注意的"。

**应该是**：
- 架构/设计阶段 → 只推 design 级陷阱（调度冲突、FIFO 选型、跨时钟域）
- 编码阶段 → 推 code 级陷阱（Bool/Bit 区分、位宽对齐、P0005）
- 提交前 → 推全量检查

**当前 specmate 没有这个分层能力**——这是结构问题，不是 bug。

#### 对用户问题的直接回答

用户说："Agent 在写 SPI 控制器时，specmate 推了'Bit#(1) 不要用 Bool'——这不对。"

**如果 Agent 还在设计架构阶段：完全不对，就是干扰。** SPI 控制器的架构阶段应该关心：CPHA/CPOL 模式、CS 信号时序、移位寄存器和缓冲 FIFO 的边界。Bool vs Bit#(1) 是编码阶段的细节。

**如果 Agent 已经在写 interface 定义：对，这是正确时机。** Interface method 的返回类型选 Bool 还是 Bit#(1) 影响后续所有调用方的代码，应该在定义 interface 时就决定。

**specmate 的问题是：它不知道现在是哪个阶段。**

### specmate 架构全貌

#### 架构分层（4 层）

| 层 | 文件 | 职责 |
|----|------|------|
| **MCP 服务层** | `bin/server.mjs` | 7 个工具的 MCP 协议入口，HTTP 服务器（端口 9339），通知推送桥接 |
| **知识引擎层** | `src/tools/` | 核心业务逻辑：统一预编码检查（specmate_guide.scan）、陷阱匹配（_matcher）、代码范式（_patterns）、编译前检查（preflight）、AST 解析（ast_query）、样式检查（check_style）、MCP 工具路由（specmate_guide）、参考文档（lookup_ref）、知识快照（knowledge_snapshot） |
| **持久化层** | `src/db/` | SQLite 数据库：错误码库（errors）、引用热度（ref_hits）、错误捕获历史（captures）、编译警告快照（warnings） |
| **推送通知层** | `src/push/` + `src/notify.mjs` | MCP notification 推送：陷阱告警（alert）、集体记忆（memory）、警告差异（diff）——由 SPECMATE_LEVEL 控制推送粒度 |

#### 7 个 MCP 工具

| # | 工具 | 输入 | 输出 | 评级 |
|---|------|------|------|------|
| 1 | **specmate_scan** | task(任务描述) + file(可选.bsv文件路径) | 统一预编码检查：陷阱提醒、设计决策建议、AST预编译扫描、下一步建议 | **核心** — 【推荐入口】替代旧的 guide(pre_code)+decide+preflight 三步 |
| 2 | **specmate_guide** | phase(pre_code/on_error/continue/decide/pattern) + input + file(可选) | 细分阶段：编码前陷阱、编译错误诊断、设计决策对比、代码骨架 | **专项** — 需要细粒度控制时使用，一般场景用 specmate_scan |
| 3 | **specmate_check** | files(.bsv路径列表) + full(是否全量检查) | 代码问题列表（位宽溢出/零位宽/Bool误用/G0053/interface Bool返回/always_ready滥用/全量正则） | **核心** — 编译前静态检查，编码完成后必调 |
| 4 | **specmate_capture** | bsc_output(编译器输出) + files(可选) | 解析出的错误码列表，自动入库 | **核心** — 编译失败后记录错误 |
| 5 | **specmate_resolve** | code(错误码) + cause(根因) + solution(方案) | 确认状态，如果同一错误码有历史则推送 memory | **核心** — 修复后固化经验 |
| 6 | **specmate_analyze** | files(路径) + question(自然语言问题) | AST 分析：调度冲突矩阵、跨 rule 冲突、依赖图、调用图、寄存器分析、方法分析、行级节点查询 | **核心** — 深入理解代码结构 |
| 7 | **specmate_diff** | bsc_output + action(snapshot/diff) | warning 快照存储 或 两次快照的 diff（新增/消除/持续） | **辅助** — 编译迭代中追踪 warning 变化 |

> **specmate_learn 已移除**（Phase 1 废弃）。capture + resolve 自动化流程完全覆盖手动录入场景。`add_error.mjs` 保留仅用于 `npm run db:seed` 脚本，不是 MCP 工具。

#### 知识图谱

`src/tools/_matcher.mjs` 的 GRAPH 对象：**30 个领域节点** + 2 个 UNIVERSAL_TRAPS（P0030、P0005）。

领域覆盖：fifo, pipeline, clock, reset, axi, bram, fsm, bvi, spi, crc, uart, struct, union, attribute, interface, rule, method, types, vector, schedule, regfile, arbiter, serialize, interrupt, dma, encoder, decoder, timer, gpio, synthesize。

每个节点含：errors（关联错误码）、refs（参考文档 topic）、traps（领域专属陷阱，分 hard/quality/style 三级）、style（代码风格偏好）、pattern（范式模板 ID）。

UNIVERSAL_TRAPS 是不依赖关键词匹配的全局陷阱——解决 encoder 任务不匹配 fsm/method 节点导致漏掉 P0030 的问题。

#### SPECMATE_LEVEL 三种模式

| 模式 | mode | 触发时机 | 可见陷阱级别 | pushPreCode | pushCheckStyle | pushOnError | pushDiff | pushAnalyze |
|------|------|---------|-------------|-------------|----------------|-------------|----------|-------------|
| **verify** | passive | Agent 问才答 | 仅 hard | 关 | 关 | 关 | 关 | 关 |
| **develop** | suggestive | 编码前主动推陷阱 | hard + quality | 开 | 关 | 关 | 关 | 关 |
| **tapeout** | collaborative | 全程守护，全量检查 | hard + quality + style | 开 | 开 | 开 | 开 | 开 |

别名：silicon → verify, wafer → develop。

#### SPP 推送协议

基于 MCP Notification 机制（不是 WebSocket，已替代）。三种消息类型：

- **alert** (`notifications/specmate/alert`)：陷阱/错误/冲突即时通知
- **memory** (`notifications/specmate/memory`)：同一错误码重复出现时的历史提醒
- **diff** (`notifications/specmate/diff`)：两次编译之间 warning 变化

推送由 `alerts.mjs` 中的 6 个函数触发：onPreCode、onPattern、onCheckStyle、onCapture、onResolve、onDiff、onAnalyzeConflicts。每个函数内部检查 `shouldPush(flag)` 门控——门控配置在 `config.mjs` 的 LEVEL_LIMITS 中。

**关键缺陷**：推送完全由 SPECMATE_LEVEL 控制粒度，但没有任何"设计阶段感知"——不知道 Agent 在架构阶段还是编码阶段。

#### 数据库（4 张表）

| 表 | 字段 | 用途 |
|----|------|------|
| **errors** | id, code(PK), title, keywords, phenomena, cause, solution, rules, count | 错误码知识库。count 字段跟踪命中次数——越常查的错越靠前 |
| **ref_hits** | topic(PK), count | 参考文档热度追踪。决定哪些 topic 是"热点" |
| **captures** | id, code, timestamp, bsc_output, files, cause, solution, status | 错误捕获流水线。每次 bsc 编译错误被 capture 入库，resolve 后标记 resolved。形成项目级错误记忆 |
| **warnings** | id, snapshot_id, timestamp, file, line, code, message | 编译 warning 快照。支持 diff 对比——追踪哪些 warning 是新增、哪些已消除 |

### 所属框架
specmate 是 **Kova**（领域知识引擎框架）在 BSV 领域的第一个实例。DKE 架构 x BSV 领域。

### 核心理念
- **知识应该越用越强**：SQLite 命中计数，每次踩坑都让知识库强一分。不是一般静态文档能做到的
- **拦 > 修**：preflight 接入 AST 扫描 5 种高频错误模式，不调 bsc 就能发现
- **话少 > 话多，但要在正确时机说**：当前推送时机是 specmate 最大的结构性问题——不知道 Agent 的设计阶段
- **不是编译器**：不加 bsc 进核心，保持轻量。specmate 是 bsc 之上的经验层，不是替代品

### 已验证效果（5 场对照实验）
- 编码时间：-47%（SD 卡控制器）
- 代码质量（盲审）：22/25 vs 19/25（CRC-32）
- 跨时钟域 SoC 盲审：**96.5/100**（silicon 社恐模式）vs 85.5（裸 Agent）
- UART：22/25 vs 16/25（specmate_bench 自动化框架）

## 当前状态

- **服务器**：运行中，端口 9339，默认 stdio 传输
- **SPECMATE_LEVEL**：develop（suggestive 模式）
- **数据库**：SQLite，含 26 个错误码（P/T/G/BSV 系列）
- **最近分支**：master，HEAD = `245fbfd`（Agent B 模板速查表新增 specmate_diagnose 工具行）
- **架构裁定（议会 S02E03，2026-07-14）**：CLI 降级为人类调试辅助，MCP 为 Agent 唯一正式通道。specmate_scan 为推荐统一入口（替代旧的三步调用）
- **MCP 工具**：8 个（新增 specmate_diagnose 编译日志全量诊断工具，`eea5048`）
- **Q3 路线图**：✅ **全部完成**（2026-07-18）。MCP Elicitation（`src/elicitation/elicit-phase.mjs`）+ BSC Orchestration（`src/compile/bsc-runner.mjs`）+ 未知错误 LLM 分析（`src/tools/_similarity.mjs` + `_context.mjs`）
- **TRAPS 统一知识基**：12 条已验证 trap（替代旧 UNIVERSAL_TRAPS 2 条），全部 `verified: true`，覆盖 P0030/P0005/Bool vs Bit/G0004/G0053/interface Bool/always_ready guard/P0022/Vector构造/PulseWire/urgency/跨时钟域
- **GRAPH 节点**：30 个领域节点 — 22 个 traps 数组为空（知识体系重构后移除未验证内容），8 个节点已回填已验证 trap（fifo/fsm/schedule/arbiter/interrupt/gpio/crc/uart/spi/bram）。53 条未验证 trap 在 backlog 待推进
- **trap 验证进度**：backlog 65 条，已验证 12 条 GRAPH trap（fifo-1/fsm-1/axi-1/fsm-2/schedule-1/arbiter-1/interrupt-2/gpio-2/crc-2/uart-1/spi-1/bram-1）+ 12 条已升至 TRAPS 数组（代码验证+fixture），P0 backlog 剩余 2 条（schedule-2/arbiter-2）
- **check 规则**：19 条（11 always-on + 8 full-scan），含知识盲区修复（`15d1496`/`b1c5d4b`）新增的 P0-synthesize-order/P1-bool-bit-op/P1-bram-read/P1-regfile-read 等
- **CI 自动化**：husky pre-commit hook 已配置（`906c275`），自动运行 `npm test` + `node test/fixtures/run-fixtures.mjs`
- **文档重组**：`3f6a93c` 将 5 篇历史文件归档至 `docs/archive/`，归并 blog 草稿至 `docs/articles/`，删除过期 health-check.md
- **知识系统优化**：三个 P0 全部解决（自动 seed `1dbb5d3` / session 去重 `22afd56` / 统计指标 `f57d4ff`）。Phase 0-3 全部完成（session 管理 `ecce5d2` → 管道冲突检测 `7ca2c60` → diagnose 诊断 `eea5048`）
- **MCP 工具描述**：`e21b5fe` 重写 8 个工具描述为统一中文规范格式
- **parser 修复**：`183bc3f` 双格式兼容（粗体 + Markdown 标题），smoke test 12 遍历 29 篇 error doc 全部通过
- **Q4 路线图**：✅ Streaming 流式输出 + MCP Registry 注册全部完成（2026-07-18）

## 当前功能全景

> 当前版本：**v0.1.1**（开发中，本地 Q3+Q4 已实现，尚未推公开仓库）
> 最后更新：2026-07-18

### MCP 工具（8个）

1. **specmate_scan** — 统一入口：陷阱预测 + AST 预扫描 + 设计建议 + NEXT STEPS
2. **specmate_check** — 19 条静态检查规则，可选 `compile=true` 触发 BSC 编译
3. **specmate_diagnose** — 流式批量诊断，边分析边输出（async generator）
4. **specmate_capture** — BSC 编译错误自动入库，跨 session 统计
5. **specmate_resolve** — 固化修复方案，知识积累闭环
6. **specmate_analyze** — tree-sitter 深度解析：调度冲突矩阵、依赖图、寄存器分析
7. **specmate_diff** — 编译 warning 快照对比，追踪变化
8. **specmate_guide** — 分阶段指导（pre_code / on_error / continue / decide / pattern）

### Q3 新增能力（已实现）

- **MCP Elicitation**：主动询问 Agent 设计阶段，与三级模式绑定（verify/develop/tapeout）。`resolvePhase()` 优先 elicitation → 失败回退 `inferPhase()` 关键词推断
- **BSC Orchestration**：`specmate_check(compile=true)` — native bsc → Docker 兜底，编译+诊断一步完成。超时控制 120s，session 级编译缓存
- **未知错误自动分析**：Jaccard 相似度匹配 + 源码上下文（树定位到最近 rule/method）+ few-shot（top-3 相似已知错误），LLM 推理 → capture 入库，形成自增长知识闭环

### Q4 新增能力（已实现）

- **diagnoseStream()**：async generator 流式输出，按错误码分组逐条 yield，边处理边返回。`diagnose()` 保留向后兼容
- **MCP Registry**：条目准备完毕（名称/描述/标签/传输/运行时/配置模板），README 已更新 discovery 说明

### 知识库

| 类别 | 数量 | 说明 |
|------|------|------|
| 编码记忆 | 29 篇 | P/G/T 系列错误码文档，含现象/根因/解决方案/规则四段式 |
| 已验证陷阱 | 12 条 | bsc 编译 + fixture 双重验证，verified: true |
| backlog 待验证陷阱 | 62 条 | P0(5)/P1(16)/P2(41)，逐步推进 |
| 领域知识图谱节点 | 30 个 | fifo/pipeline/clock/reset/axi/bram/fsm/bvi/spi/crc/uart/struct/union/attribute/interface/rule/method/types/vector/schedule/regfile/arbiter/serialize/interrupt/dma/encoder/decoder/timer/gpio/synthesize |
| 代码范式模板 | 15 个 | BSV 编码范式骨架 |
| SQLite 闭环 | 自增长 | capture → diagnose → resolve → 下次命中 |

### CI/CD

| 设施 | 状态 | 说明 |
|------|------|------|
| GitHub Actions | ✅ | `knowledge-qa`（push/PR 自动测试）+ `npm-publish`（v* tag 自动发布 npm + GitHub Packages + Release） |
| pre-commit hook | ✅ | husky，31 单元 + 16 fixture + 109 smoke，不通过不提交 |
| PR/Issue 模板 | ✅ | 标准化贡献流程 |

### 三级干预强度

| 模式 | 别名 | 行为 | 陷阱级别 | 主动推送 |
|------|------|------|----------|----------|
| **verify** | 社恐 / silicon | 零主动交互，Agent 问才答 | 仅 hard | 全部关闭 |
| **develop** | 日常 / wafer | 编码前主动提醒陷阱，按阶段过滤 | hard + quality | preCode 开，其余关 |
| **tapeout** | 话痨 | 全程守护，全量检查 | hard + quality + style | 全部开启 |

### 架构分层（4 层）

| 层 | 文件范围 | 职责 |
|----|----------|------|
| **MCP 服务层** | `bin/server.mjs` | 8 个工具的 MCP 协议入口，HTTP 服务器（端口 9339），通知推送桥接 |
| **知识引擎层** | `src/tools/` | 核心业务逻辑：陷阱匹配、范式模板、AST 解析、样式检查、知识快照、参考文档 |
| **持久化层** | `src/db/` | SQLite 数据库：errors/captures/warnings/ref_hits 四表，auto-seed 自恢复 |
| **推送通知层** | `src/push/` + `src/notify.mjs` | MCP notification 推送，由 SPECMATE_LEVEL 控制粒度 |

### 推送策略（2026-07-18 更新）

> ⚠️ **新策略：只推 staging（bsv-specmate-staging），不推公开仓库（bsv-specmate）。等实际使用验证后再公开。**

## 最近改动（2026-07-16 ~ 2026-07-18）

### 待提交 — 每日 trap 验证：9 条 backlog trap → GRAPH 节点回填（2026-07-18）

- [x] **P0-1: fsm-2** | hard/code | `value method 不用 if-return，用 ?: 三元链`
- [x] **P0-2: schedule-1** | hard/design | `descending_urgency 不循环`
- [x] **P0-3: arbiter-1** | hard/design | `同一 cycle 超 5 读端口 → G0002`
- [x] **P1-1: interrupt-2** | hard/code | `mask 位宽 vs pending 位宽对齐`
- [x] **P1-2: gpio-2** | hard/code | `GPIO inout 信号通过 BVI 机制处理`
- [x] **P1-3: crc-2** | quality/code | `Bool vs Bit#(1) — done 用 Bit#(1)`（原文"done 用 Bool"错误建议已修正）
- [x] **P1-4: uart-1** | quality/design | `波特率分频用 Bit#(n) 而非 Integer`
- [x] **P1-5: spi-1** | quality/design | `SPI 命令字 Bit#(8), 移位寄存器匹配`
- [x] **P1-6: bram-1** | quality/design | `BRAMCore: 读/写端口分离, BRAM: 单端口 — 选对类型`
- [x] **`src/tools/_matcher.mjs`** — 9 个 GRAPH 节点 traps 数组回填（fsm/schedule/arbiter/interrupt/gpio/crc/uart/spi/bram），9 条已验证
- [x] **`test/fixtures/traps/`** — 9 个新 fixture（fsm-2/schedule-1/arbiter-1/interrupt-2/crc-2/gpio-2/uart-1/spi-1/bram-1.bsv）
- [x] **`docs/traps/`** — 9 篇新文档（对应上述 9 条 trap）
- [ ] **bsc 编译验证** — 安全分类器 deepseek-v4-pro 暂不可用，待恢复后执行 `_compile-batch.sh` 批量编译
- [ ] **`project-memory.md` / `docs/trap-verification-backlog.md`** — 进度同步已更新

### 已提交 — `906c275`: husky pre-commit hook 自动化测试门禁（2026-07-18）

- [x] **`.husky/pre-commit`** — 每次 git commit 自动运行 `npm test` + `node test/fixtures/run-fixtures.mjs`，不通过则阻止提交
- [x] **`.gitattributes`** — 确保 Unix 行尾（LF），防止 Windows CRLF 破坏 hook 脚本

### 已提交 — `e21b5fe`: 8 个 MCP 工具描述重写为统一中文格式（2026-07-16）

- [x] **`bin/server.mjs`** — 8 个 MCP 工具的 `description` 字段全部重写为一致的 `[动词] + [对象] + ⚠️[约束] + 📌[输出]` 中文格式

### 已提交 — `d2b5d64`: P2 清点验证状态同步 + S02E03 文档交付（2026-07-16）

- [x] **project-memory.md** — 标记 P2-3/P2-4/P2-6/P2-7 已完成，同步代码审查发现
- [x] **S02E03 文档三件套** — `docs/agent-integration.md` 已存在，仅缺 `templates/agents.md`

### 已提交 — `a206650`: P2 问题修复 — 批量 capture + audit parser 统一 + auto-fix 双因子判断（2026-07-15）

- [x] **批量 capture** — 支持一次性 capture 多个错误码
- [x] **audit parser 统一** — `scripts/audit-knowledge.mjs` 整合 parser 逻辑
- [x] **auto-fix 双因子判断** — 修复建议需要 AST 上下文 + 历史成功记录双重验证

### 已提交 — `6303901`: 29 篇错误文档批量补全版本标注和格式修复（2026-07-15）

- [x] **全量错误文档版本标注** — 29 篇 `docs/errors/*.md` 统一加 `> 适用 BSC 版本: 2025.07`
- [x] **格式修复** — 旧格式文档统一为标准 `## 现象`/`## 原因`/`## 解决方案`/`## 规则` 四段式

### 已提交 — `eea5048`: Phase 3 — specmate_diagnose 编译日志全量诊断工具（2026-07-15）

- [x] **`src/tools/specmate_diagnose.mjs`**（新建）— 第 8 个 MCP 工具：接受 BSC 完整编译输出，全量扫描所有错误码/警告，逐个匹配知识库并输出诊断。解决 AI Agent 需要多次往返 specmate_guide(on_error) 的低效问题
- [x] **`bin/server.mjs`** — 注册 `specmate_diagnose` MCP 工具

### 已提交 — `7ca2c60`: Phase 2 — 知识管道冲突检测 + review CLI 增强 + 知识审计脚本（2026-07-15）

- [x] **知识管道冲突检测** — `check_style.mjs` 新增规则：同一知识在不同 GRAPH 节点的描述矛盾检测
- [x] **review CLI 增强** — `bin/cli.mjs` 新增 `review` 子命令：知识条目审查、格式校验
- [x] **`scripts/audit-knowledge.mjs`**（新建）— 知识审计：遍历 GRAPH/TRAPS/errors/doc 检查完整性

### 已提交 — `ecce5d2`: Phase 0+1 — session 管理 + auto-cluster + review CLI（2026-07-15）

- [x] **session 管理增强** — 自动 session 初始化、跨 session 统计、session 统计 API
- [x] **auto-cluster** — 相同错误码的多次 capture 自动聚合为 cluster，保留历史轨迹
- [x] **review CLI 基础** — `npx specmate review` 入口建立

### 已提交 — `b45deeb`: G0004 消息澄清 + db:seed 自动护栏（2026-07-15）

- [x] **G0004 check 消息** — `checkG0004()` 输出文本从"避免同一 rule"改为更明确的"拆成多条 rule"指导
- [x] **db:seed 护栏** — `npm run db:seed` 执行前自动检查 parser 能解析多少篇 error doc，不通过则拒绝重建

### 已提交 — `15d1496` + `b1c5d4b`: P0/P1/P2 知识盲区修复（2026-07-15）

- [x] **P0 修复** — 3 篇错误文档补充（G0053/P0022/P0200）+ 2 个检查器误报修复
- [x] **P1+P2 修复** — 4 条新 check 规则（synthesize-annotation-order / bool-bit-op / bram-read / regfile-read）+ GRAPH 节点 summary 更新 + `_matcher.mjs` 修复

### 已提交 — `3f6a93c`: 文档整理 — 分类归档 + 废弃标注 + 删除冗余（2026-07-15）

- [x] **`docs/archive/`** — 5 篇历史档案移入并加废弃横幅（SPP/collaboration/MAINTAINER/spec-p0-improvements/TUTORIAL）
- [x] **`docs/articles/`** — blog-experiment-methodology.md 归并
- [x] **删除** — `docs/health-check.md`（过期舰队快照）

## 最近改动（2026-07-15 早期）

### 议题 — parser 格式兼容性修复（2026-07-15）

**问题**：`0312757` 中新增的 11 篇 error doc（G0002, G0004_FSM, G0005, G0030, G0036, G0040, G0053, G0054, G0124, P0022, P0200）使用 `## 现象`/`## 原因`/`## 解决方案`/`## 规则` 标题格式，但 `src/db/parser.mjs` 的 `parseErrorFile()` 只认 `**现象**`/`**原因**`/`**解决**`/`> **规则**:` 粗体格式。导致 11 篇文档完全无法解析入库，Agent 调 `specmate_guide(on_error="P0022")` 返回"未找到"。

**根因**：reviewer 未对比 parser 正则和文档格式。ops 的 `npm run db:seed` 被安全分类器阻塞未执行。缺少自动化护栏验证新增 error doc 能被解析。

- [x] **parser.mjs 双格式兼容** — `parseErrorFile()` 同时识别粗体标记（`**现象**`/`**原因**`/`**解决**`）和 Markdown 标题标记（`## 现象`/`## 原因`/`## 解决方案`/`## 规则`）
- [x] **smoke test 新增 parser 全量验证** — 测试 12 遍历所有 `docs/errors/*.md`（29 篇），逐篇调 `parseErrorFile()` 验证 code/title/phenomena/cause/solution/rules 非空
- [x] **project-memory.md 更新** — 记录 bug、教训、reviewer checklist（设计决策 #11）
- [ ] **npm run db:seed 重新建库** — 安全分类器阻塞，暂未执行。修复后需跑一次确保新文档入库

### 已提交 — `3d8b891`: MCP 工具 4 项修复

- [x] **MCP 工具路径验证** — `specmate_check`、`specmate_analyze` 等工具入口加 `validateFilePaths()` 校验，相对路径不再静默失败——返回明确错误提示
- [x] **CLI→MCP 文案修复** — NEXT STEPS 区块和其他输出中不再推荐 `npx specmate` CLI 命令，改为提示 MCP 工具调用（如 `mcp__bsv-specmate__specmate_check`）
- [x] **specmate_learn 残余清理** — 移除 `server.mjs` 和文档中所有 `specmate_learn` 引用。capture + resolve 自动化流程完全覆盖手动录入场景
- [x] **烟雾测试扩展到 11 用例** — 新增 path-validation、cli-text、scan-output、check-files、guide-on-error、capture-resolve-flow、analyze-question、diff-snapshot、db-seed-chain、stats-output、no-learn-residual，全部 61 项检查通过

### 已提交 — `f57d4ff`: 统计指标嵌入 capture/resolve 响应

- [x] **specmate_capture 响应加统计** — 捕获错误后显示该错误码历史出现次数和修复率
- [x] **specmate_resolve 响应加统计** — 固化修复后显示修复率变化（如 `修复率: 3/5 (60.0%)`）
- [x] **数据来源跨 session 持久化** — 统计基于跨任务 captures 表聚合，体现"知识越用越强"

### 已提交 — `22afd56`: capture/check 去重 + session 管理 + 自动 seed 修复

- [x] **captures 表加 session_id** — `src/db/schema.mjs` 新增 `session_id` 字段，`initSession()` 自动生成 UUID，Agent 不感知。解决无法区分不同任务捕获记录的问题
- [x] **capture 去重** — 同一 session 内同一错误码只记录一次，避免重复捕获
- [x] **check 去重** — 同一次 check 调用中同一规则只报告一次
- [x] **自动 seed 修复** — `ensureDB()` 迁移顺序调整，修复空数据库迁移后 errors 表未自动填充的问题

### 已提交 — `1dbb5d3`: 数据库自动 seed

- [x] **提取 parser.mjs** — `src/db/parser.mjs`（新建）：从 `seed.mjs` 提取 `parseErrorFile()` 和 `collectErrorFiles()` 为共享模块
- [x] **ensureDB() 加 autoSeedIfEmpty()** — `src/db/query.mjs`：建库后检查 errors 表是否为空，为空则从 `docs/errors/*.md` 自动解析并插入。覆盖两条路径：新数据库 + 旧版迁移的空 schema
- [x] **seed.mjs 改为幂等模式** — 删除 `DROP TABLE IF EXISTS errors`，`initDB` 用 `IF NOT EXISTS`，`insertError` 用 `INSERT OR REPLACE`
- [x] **data/knowledge.db 不再是必需品** — auto-seed 从 Markdown 重建更可靠；`config.mjs` 中的 `initDataDir()` 保留复制逻辑作为性能优化

## 最近改动（2026-07-14）

### 已提交 — 知识体系重构：从建议系统变为验证层

议会决议（2026-07-14）落地（已提交在 `9972cf2` 和 `04dc98d`）：

- [x] **砍掉未验证内容** — `_matcher.mjs` `formatTrapsOutput()` 过滤所有 `verified: false` 的 GRAPH trap（仅 `alwaysShow: true` 的 UNIVERSAL_TRAPS 保留）
- [x] **关闭主动指导** — `specmate_guide.mjs` preCode() 和 scan() 仅输出 UNIVERSAL_TRAPS + preflight AST 结果 + 明确告知 Agent specmate 不做主动指导；decide() 返回不可用消息
- [x] **修复 4 条 P0 错误** — `_matcher.mjs` 3 处 "done 用 Bool" 改为 Bit#(1)（crc/dma/timer）+ `preflight.mjs` scanG0005 文本从"模块定义前"改为"每个 rule 定义前"
- [x] **新增 2 条 check 规则** — `check_style.mjs` checkInterfaceBoolReturn（interface method 返回 Bool 检测）+ checkAlwaysAttrMisuse（always_ready/enabled 滥用检测），均为 always-on
- [x] **fixture 验证体系** — `test/fixtures/check/` 下 2 个规则各 pass.bsv + fail.bsv + `run-fixtures.mjs` 脚本（4/4 通过）
- [x] **知识条目验证铁律** — 写入 CLAUDE.md 和 project-memory.md
- [x] **Agent B 模板切换为检查员模式** — `specmate_bench/templates/agents-autonomous.md` 从 5 步命令式改为 3 步检查式（check + on_error，关闭 pre_code/scan/decide）

## 最近改动（2026-07-13）

### 已提交 — 5 个早期 commit
- [x] **styles.md 修复** — Style 2 和 Style 4 的不良示范已替换（`ca593ab`）
- [x] **traps 分级 + 通用陷阱层** — `_matcher.mjs` 22 节点分 hard/quality/style 三级 + `UNIVERSAL_TRAPS`（`c8e3f3f`）
- [x] **encoder 范式+陷阱修复** — `_patterns.mjs` 新增 encoder 模板（findIndex 骨架），移除误导性 foldl 建议（`d9d6cee`）
- [x] **Bool/Bit 警告加强** — `preflight.mjs` 对 interface 方法的 Bool vs Bit#(1) 做更明确区分（`e4c724c`）
- [x] **project-memory.md 纳入版本控制** — 确认 CCB/MCP 配置已在 .gitignore 中排除（`a7e788b`）

### 已提交 — `bdbc780`: P0 恢复 + G0004 preflight + SKILL.md（2026-07-13）
- [x] **`src/tools/check_style.mjs`** — 恢复 4 条被误禁规则：checkMultiSubmodule、checkVecUsage、checkBoolBitMismatch、checkValueMethodSyntax（之前以"BSC 100% 覆盖"为由禁用，实际上 preflight 要先于 BSC 捕获）
- [x] **`bin/cli.mjs`** — check 默认 full=true（之前为 false，仅 4 条 always-on 规则），确保 Agent 走 `npx specmate check` 时获得完整检查
- [x] **`src/tools/preflight.mjs`** — 新增 `scanG0004` AST 扫描：检测单个 rule 内的多子模块方法调用（Agent A 在 07-i2c 中为此卡了 6 轮）
- [x] **`src/tools/specmate_guide.mjs`** — scan() 的 NEXT STEPS 区块集成 `lookup_example` 关键词推荐和 suggest-style 错误码→lookup_ref 路由
- [x] **`AGENTS.md`**（根目录） — 精简为 4 步 specmate 流水线：scan → check → guide → example
- [x] **`SKILL.md`** — 新增交互手册：8 种场景、双通道速查表（MCP 工具 vs CLI 命令）
- [x] **`bin/server.mjs`** — 移除 specmate_guide 和 specmate_capture 的 DEPRECATED 标记，恢复为合法 MCP 入口
- [x] **`src/notify.mjs`** — @deprecated → @dormant，保留 MCP notification 基础设施
- [x] **`src/push/alerts.mjs`** — @deprecated → @dormant，函数保留为 no-op shells
- [x] **`examples/templates/AGENTS.md`** — 末尾加入完整的 4 步 specmate 流水线（含 scan/check/on_error+resolve/example）

### 已提交 — `0312757`: GPiO 陷阱修复 + QA 底座 Phase 1 + 错误文档补齐（2026-07-13）
- [x] **GPiO Inout 陷阱文本修复** — `_matcher.mjs` 第 270 行 GPiO 节点的第 2 条 hard 级别 trap 文本更正：旧文本错误引导"用 Inout#(Bit#(1)) 包装"；新文本明确指导通过 BVI 机制将 inout 拆分为 data_in/data_out/oe 三组独立 method。Inout#() 包装器标记为旧版 BSC 库用法，不推荐在 BSC 2025.07 中使用。
- [x] **全部 trap 加 QA 元数据** — 2 条 UNIVERSAL_TRAPS + 30 个 GRAPH 节点共 ~60+ 条 trap，全部加 `bscVersions: ['2025.07']` 和 `verified: false` 字段。旧语法审查结果：仅 GPiO 节点的 Inout 陷阱引用旧版语法（已修正），其他所有 trap 均为 BSC 2025.07 适用。
- [x] **知识验证测试** — `test/knowledge-validation.test.mjs`：7 项自动化检查覆盖 bscVersions 存在性/合法值、verified 字段、错误文档完整性、UNIVERSAL_TRAPS 完整性
- [x] **verify-traps CLI** — `scripts/verify-traps.mjs`：列出所有 verified=false 的 trap，支持 --csv/--json/--count/--hard-only
- [x] **CI 配置骨架** — `.github/workflows/knowledge-qa.yml`：unit-tests、knowledge-validation、compile-fixtures 三个 job
- [x] **错误文档补齐** — 新增 11 篇：G0002、G0004_FSM、G0030、G0040、G0054、G0124、P0073、P0085、T0016、T0132、T0144。GRAPH 全部 26 个错误码现均有对应 .md 文档。
- [x] **package.json** — 新增 knowledge:validate 和 verify-traps 脚本

### 旧语法审查结果（`0312757` 提交期间）

遍历了 `_matcher.mjs` 中 GRAPH 全部 30 节点和 UNIVERSAL_TRAPS，仅发现 1 处引用旧版 BSV 语法：
- **GPiO 节点 trap #2**（已修正）：提及 `Inout#(Bit#(1))` 包装器 — 这是旧版 BSC 库用法，BSC 2025.07 中改为通过 BVI 拆分 signal pair 方式处理 inout。

未发现 `Clock.bsv` 旧用法引用。所有其他 trap 的指导内容均为 BSC 2025.07 适用。

### 已提交 — `b05366a` + `8b3c9c2`: Phase 1 CLI + preflight AST 集成（2026-07-12）
- [x] **`bin/cli.mjs`** — `npx specmate scan/check` CLI 入口，合并 5 个 guide phase 为单一 scan() 入口，DECISIONS 查找表自动嵌入 scan 输出
- [x] **MCP 传输迁移** — server 默认从 HTTP 迁移到 stdio，HTTP 仅作备选
- [x] **`src/tools/preflight.mjs`** — preflight 接入 AST 扫描 P0030/T0043/G0053/G0005，新增 G0004（`bdbc780` 进一步扩展）
- [x] **`src/tools/knowledge_snapshot.mjs`** — 离线知识快照：纯 Markdown 文件不依赖 MCP/HTTP，安全分类器故障时作为知识后备
- [x] **`docs/architecture.md`** — 架构决策记录
- [x] **24/24 tests pass**，CLI scan/check 在 Windows 验证通过

### 推送状态
- staging（`bsv-specmate-staging`）：HEAD = `1dbb5d3`（工作区有未提交的 project-memory.md 更新）
- 公开（`bsv-specmate`）：**待用户确认后推送**（领先 staging）
- **本地未提交**：project-memory.md（本次 session 更新）

## 仓库与发布

### 双远程配置

| Remote | URL | 用途 | 权限 |
|--------|-----|------|------|
| `bsv-specmate-staging` | `https://github.com/Alele496/bsv-specmate-staging` | 私有开发仓库，日常推送目标 | 本人 |
| `bsv-specmate` | `https://github.com/Alele496/bsv-specmate` | 公开仓库（npm 包发布源） | 公开可读，本人可写 |

### 推送工作流（2026-07-18 更新）

```
developer 完成修改 → reviewer PASS → ops 推 staging（bsv-specmate-staging）
  → 实际使用验证通过 → 用户确认 → ops 推公开（bsv-specmate）
```

关键约束：
- **只推 staging（bsv-specmate-staging）**，公开仓库（bsv-specmate）暂不推送
- **公开推送需实际使用验证**：在当前项目中实际使用 specmate，确认无问题后再推公开
- **npm publish 需单独确认**——这是不可逆操作
- 两个 remote 的 master 分支以 staging 领先，公开暂不跟

### 提交规范

遵循 Armada 架构的提交约定：

```
Author: Alele496 <Alele496@users.noreply.github.com>

type: description

Co-Authored-By: 台阁 <armada@bsv-agent>
```

- 格式：conventional commits（`feat:`/`fix:`/`docs:`/`refactor:`/`test:`）
- 通过 ops agent 推送的提交尾部加 `Co-Authored-By: 台阁`，表示这是 Armada 架构协作产出
- 手工提交不需要 Co-Authored-By 尾部署名

### npm 包管理

| 字段 | 值 |
|------|-----|
| 包名 | `bsv-specmate` |
| 版本 | `0.1.0` |
| License | MIT |
| 入口 | `bin/server.mjs`（可全局安装 `npx bsv-specmate`） |
| 最低 Node.js | >= 18 |

**运行时依赖：**

| 包 | 版本 | 用途 |
|----|------|------|
| `@modelcontextprotocol/sdk` | ^1.9.0 | MCP 协议实现 |
| `sql.js` | ^1.12.0 | SQLite（编码记忆存储） |
| `tree-sitter` | ^0.25.0 | 语法树解析器 |
| `tree-sitter-bsv` | ^0.1.0 | BSV 语法定义 |

**npm 脚本：**

| 命令 | 用途 |
|------|------|
| `npm start` | 启动 MCP 服务器 |
| `npm test` | 运行测试（query / matcher / ast_query） |
| `npm run db:seed` | 从 Markdown 重建错误数据库 |
| `npm run db:export` | 导出数据库内容为 Markdown |
| `npm run health-check` | 健康检查脚本 |

**发布约束：**
- npm publish 是不可逆操作，需用户单独确认
- 发布前需实际使用验证通过
- 当前版本 0.1.0 尚未发布到 npm registry（本地 0.1.1 待验证后发布）

## 当前任务

### 已完成
- [x] **知识系统优化** — P0 三个问题全部解决：session 去重（`22afd56`）、统计指标（`f57d4ff`）、自动 seed（`1dbb5d3`）。烟雾测试 11 用例 61/61 全部通过。
- [x] **MCP 工具修复** — 路径验证、CLI→MCP 文案、specmate_learn 残余清理（`3d8b891`）。
- [x] **深度审查 PASS** — 安全/性能/规范三线审查完成，6 个 P2 问题中 4 个已修复。
- [x] **Phase 0-3 完成** — session 管理（`ecce5d2`）→ 管道冲突检测（`7ca2c60`）→ diagnose 诊断（`eea5048`）
- [x] **P0/P1/P2 知识盲区修复** — 3 篇错误文档补充 + 4 条新 check 规则 + 2 个检查器误报修复（`15d1496`/`b1c5d4b`）
- [x] **29 篇错误文档批量补全版本标注和格式修复**（`6303901`）
- [x] **文档重组** — 5 篇档案归档 + blog 归并 + health-check.md 删除（`3f6a93c`）
- [x] **8 个 MCP 工具描述重写** — 统一中文规范格式（`e21b5fe`）
- [x] **CI 自动化** — husky pre-commit hook 配置（`906c275`），自动跑 npm test + fixtures
- [x] **parser 双格式兼容** — heading 格式 error doc 可解析（`183bc3f`）
- [x] **db:seed auto-guardrail** — 重建前自动检查 parser 能解析多少篇 doc（`b45deeb`）
- [x] **全貌知识债分析（2026-07-18）** — project-memory.md 同步至最新提交，识别所有 P1/P2 待办项
- [x] **Q3 路线图全部完成（2026-07-18）** — MCP Elicitation + BSC Orchestration + 未知错误 LLM 自动分析，三个方向全部实施
- [x] **Q4 路线图全部完成（2026-07-18）** — Streaming 流式输出（diagnoseStream async generator）+ MCP Registry 注册（条目+README 更新）

### 进行中
- [ ] **trap 每日验证 pipeline（2026-07-14 启动）** — 65 条未验证 trap 已导出到 `docs/trap-verification-backlog.md`，按 P0(8)/P1(16)/P2(41) 分级。**已验证 12 条 GRAPH trap**（fifo-1/fsm-1/axi-1 ≈ 07-14；fsm-2/schedule-1/arbiter-1/interrupt-2/gpio-2/crc-2/uart-1/spi-1/bram-1 ≈ 07-18），P0 剩余 2 条（schedule-2/arbiter-2）。另外 12 条 TRAPS 数组条目已代码验证通过（verified: true + fixture）。每日验证要求：每天至少验证 3 条 trap。目标：两个月清空 backlog。
- [ ] **bench 重跑** — 用修复后的 specmate 重跑实验，验证 Q3+Q4 改动的实际效果
- [ ] **实际使用验证** — 在当前项目中实际使用 specmate，纳入日常开发流程，收集反馈

### Q4 路线图（2026-07-18 — ✅ 已完成 2026-07-18）

> Q4 两个方向（议会已确认）：Streaming 流式输出 + MCP Registry 注册。**全部已实施。**

#### 方向 1：Streaming 流式输出

**目标**：`specmate_diagnose` 从 `async function → Promise<string>` 改为 async generator，每处理完一个错误码就 yield 一个 chunk，不等全部处理完，减少 Agent 等待时间。

**主要改动**：
- `src/tools/specmate_diagnose.mjs`：新增 `diagnoseStream()` async generator，保留 `diagnose()` 向后兼容
- `bin/server.mjs`：`specmate_diagnose` 工具定义改为 stream 模式

**子任务**：

- [x] **1.1 `diagnoseStream()` async generator** — `src/tools/specmate_diagnose.mjs` 新增 `export async function* diagnoseStream()`，按错误码分组逐条 yield。Header → per-code chunks → unknown section → footer
- [x] **1.2 `diagnose()` 向后兼容包装** — 保留原 `diagnose()` 函数签名（`Promise<string>`），内部调用 `diagnoseStream()` 收集全部 chunk 后 join 返回。现有调用方无感知
- [x] **1.3 `server.mjs` stream 模式** — `specmate_diagnose` handler 改为使用 `diagnoseStream()` 迭代 accumulate。架构已为 HTTP/SSE streaming 准备就绪
- [x] **1.4 评估其他工具** — `specmate_scan` 输出较小（陷阱提醒 + preflight + NEXT STEPS），不需要流式；`specmate_analyze` 输出多为结构化矩阵，当前返回量可控。两个工具暂不改造，维持现状
- [x] **1.5 测试验证** — `npm test` 全部通过

**改造成本估算**：200-400 行

---

#### 方向 2：MCP Registry 注册

**目标**：将 specmate 注册到 MCP Registry，让 Agent/用户可以通过 Registry 发现和安装 specmate MCP 服务。

**子任务**：

- [x] **2.1 MCP Registry 规范调研** — MCP Registry 即 `modelcontextprotocol/servers` GitHub 仓库：每个 server 一个目录 + README.md，根 README 按类别（Official/Community）列出。注册通过提交 PR 添加服务器到对应类别
- [x] **2.2 准备 Registry 条目** — 名称: `bsv-specmate` | 描述: BSV (Bluespec SystemVerilog) Coding Knowledge Engine | 标签: bluespec, bsv, hardware, verilog, mcp | 类别: Developer Tools / Hardware Design | 传输: stdio (primary), HTTP:9339 (optional) | 运行时: Node.js >= 18 | 包: `npx bsv-specmate` | 配置模板已完成（见下）
- [x] **2.3 项目文档更新** — `README.md` "配置 MCP" 节已添加 MCP Registry 发现说明，包含 Registry 链接和 `mcp add bsv-specmate` 一键安装提示

#### Registry 配置模板

**Claude Desktop / Claude Code (stdio)**:
```json
{
  "mcpServers": {
    "bsv-specmate": {
      "command": "npx",
      "args": ["-y", "bsv-specmate"],
      "env": {
        "SPECMATE_LEVEL": "develop"
      }
    }
  }
}
```

**Claude Code (HTTP)**:
```json
{
  "mcpServers": {
    "bsv-specmate": {
      "url": "http://127.0.0.1:9339/mcp",
      "transport": "http"
    }
  }
}
```

---

### 计划中（短期）
- [ ] **SHOWDOWN.md 考虑归档** — 675 行旧实验报告，`docs/experiments/` 已有更完整记录
- [ ] **错误码 bsc 2025.07 兼容性审查** — P0005 "let 绑定" 建议在新版 bsc 中可能不可用（P2）

### 计划中（中期）
- [ ] **16 个知识图谱节点补 pattern 字段** — 当前 30 个 GRAPH 节点中有 16 个缺 pattern（reset/struct/union/attribute/interface/rule/method/types/vector/schedule/dma/decoder/timer/gpio/synthesize）
- [ ] **26 个知识图谱节点补 style 字段** — 当前仅 4 个节点有 style（fifo/pipeline/axi/fsm）
- [ ] **62 条 backlog trap 逐步验证回填至 GRAPH 节点** — 29 个 GRAPH 节点 traps 数组当前为空（知识体系重构后移除未验证内容），需按每日 pipeline 逐步回填

### Q3 路线图（2026-07-18 议会确认 — ✅ 已完成 2026-07-18）

> 议会完成了 specmate 后续发展讨论，三个方向确认进入 Q3 计划。**全部已实施。**

#### 议会核心结论

- **BSV 是"太小而无法竞争"的利基** — LLM 训练数据中 BSV 是噪声级别。specmate 的价值不来自 LLM 能力提升，而来自领域知识的稀缺性
- **specmate 的护城河是结构性的** — LLM 越强，越需要领域知识层来纠正幻觉。specmate 做 LLM 做不了的事：BSV 领域经验
- **LangChain 集成不做** — 边际价值极低，需要的人可自己通过独立 pip 包调用 specmate MCP
- **Q4 预计划**：Streaming 输出（长编译实时反馈）+ MCP Registry 注册（服务发现）

#### 实现顺序与依赖分析

```
Elicitation（阶段感知）
  └→ BSC orchestration（编译链路）
       └→ 未知错误 LLM 分析（在编译输出足够丰富后才有价值）
```

- **Elicitation 第一**：让 specmate 知道 Agent 当前在架构阶段还是编码阶段，是后续所有功能的基础——BSC orchestration 需要根据阶段决定编译策略，未知错误分析需要阶段上下文来决定取多少行源码
- **BSC orchestration 第二**：打通 specmate → bsc 编译链路，编译输出自动喂给 diagnose。没有这一步，未知错误分析没有输入
- **未知错误分析第三**：在编译链路打通、diagnose 能拿到全量错误输出后，才有足够素材做"未知错误 → LLM 推理 → capture 入库"闭环

---

#### 方向 1：MCP Elicitation + 三级模式绑定

**目标**：解决 `inferPhase()` 靠关键词猜 Agent 设计阶段的根本缺陷。利用 MCP 协议新增的"服务器主动询问客户端"（Elicitation）能力，让 specmate 在关键节点主动问 Agent 当前阶段，而非被动猜测。

**关键设计决策**：
- 三级干预强度与 elicitation 时机绑定：verify（不问，纯被动）/ develop（编码前问一次，确定阶段后按阶段过滤陷阱）/ tapeout（每个关键节点确认：写完 rule 后、模块集成前、提交前）
- Elicitation 不是替代 inferPhase()，而是在 inferPhase() 不确定时作为 fallback
- 询问内容示例：`"你目前在：A) 架构设计（选模块、定接口） B) 编码实现（写 rule/method） C) 编译调试（修错误）"`

**子任务**：

- [x] **1.1 MCP Elicitation 协议调研** — 确认 MCP SDK 1.29.0 完整支持 elicitation（`server.elicitInput()` API），HTTP/SSE 完整支持，stdio 依赖客户端实现。新建 `src/elicitation/elicit-phase.mjs`
- [x] **1.2 Elicitation 触发策略设计** — 定义三个模式的 elicitation 触发决策表（`ELICIT_TRIGGERS`）：verify（0 次）、develop（pre_code 入口 1 次）、tapeout（pre_code / on_error / check 后 / 模块集成前各 1 次）
- [x] **1.3 Elicitation 消息模板** — 设计 3 选项 A/B/C 的 JSON Schema form（design/code/debug），`PHASE_FORM_SCHEMA` + `PHASE_FORM_MESSAGE`
- [x] **1.4 阶段状态管理** — `getCurrentSessionPhase()` / `setCurrentSessionPhase()` 持久化 Agent 当前阶段到 session。develop 模式同一 session 只问一次
- [x] **1.5 inferPhase() 重构为 fallback** — `resolvePhase()` 实现：优先 elicitation → 失败回退 `inferPhase()` 关键词推断。`specmate_guide.mjs` 的 `scan()` 和 `preCode()` 已接入
- [x] **1.6 与三级 SPP 推送绑定** — `specmate_guide.mjs` 中 preCode/continue/on_error 三个入口均接入 `resolvePhase()`，`alerts.mjs` 按阶段过滤推送
- [x] **1.7 server.mjs 集成** — `bin/server.mjs` 已 import `resolvePhase`，`specmate_scan` 和 `specmate_guide` 工具定义中传递 mcpServer 实例

---

#### 方向 2：BSC Orchestration — `specmate_check(compile=true)`

**目标**：让 specmate 能 spawn bsc 子进程跑编译，自动将编译输出喂给 `specmate_diagnose`，形成"编译 → 诊断 → 修复建议"一条龙。specmate 不做 bsc 的 wrapper——不替代 bsc，做 bsc 之上的 orchestration（编译 + 经验层）。

**关键设计决策**：
- `compile` 参数默认 `false`（opt-in），避免 Agent 意外触发编译
- 平台兼容策略：优先 native bsc → Docker 兜底（`ghcr.io/alexforencich/bsc:latest`）
- 超时控制 120s，错误输出只取最后 200 行（防止超大日志撑爆 context）
- 架构定位：orchestration，不是 wrapper。specmate 不解析 bsc 输出格式（那是 diagnose 的事），只负责调用 bsc 和传递结果

**子任务**：

- [x] **2.1 bsc 可用性检测** — 新增 `src/compile/bsc-runner.mjs`：先检测 `bsc` 是否在 PATH，不在则检测 Docker。缓存检测结果避免重复执行
- [x] **2.2 bsc 编译执行器** — `src/compile/bsc-runner.mjs`：`spawn('bsc', [...args])`，支持 build flag 传递（`-verilog`/`-vdir`/`-bdir` 等），120s 超时，输出截断（后 200 行 + 前 20 行）
- [x] **2.3 Docker fallback** — 当 native bsc 不可用时，检测 Docker daemon 是否运行，用 `docker run --rm ghcr.io/alexforencich/bsc:latest bsc ...` 跑编译
- [x] **2.4 `specmate_check` compile 参数集成** — 在 `bin/server.mjs` 的工具定义中给 `specmate_check` 新增 `compile` 参数（boolean，默认 false）。`check_style.mjs` 接收 compile flag
- [x] **2.5 编译→diagnose 流水线** — compile=true 时 check 流程：先跑现有静态检查 → 再 spawn bsc → 编译输出自动喂给 `specmate_diagnose()` → 静态检查结果 + diagnose 结果合并返回
- [x] **2.6 编译缓存策略** — 同一次 session 内同一组文件（按文件路径 + mtime 哈希）不重复编译。`session.compileCache` 记录
- [x] **2.7 错误处理与降级** — bsc 不可用且 Docker 不可用时，返回明确警告"编译不可用：未检测到 bsc 且 Docker 未运行"，但不阻塞静态检查结果返回
- [x] **2.8 编译流水线集成** — `bin/server.mjs` 中 `specmate_check` 工具 handler 已接入 `compile=true` 分支，`src/tools/check_style.mjs` 接收并转发编译参数

---

#### 方向 3：未知错误 LLM 辅助分析（自动知识增长闭环）

**目标**：让 specmate 的知识库能自己生长。当前 29 篇 error doc 只能覆盖已知错误。遇到未知错误时，specmate 拼装上下文交给 Agent 的 LLM 推理，推理结果通过 `specmate_capture` 自动入库——下次同样错误码直接命中。

**关键设计决策**：
- **specmate 不做推理，做上下文拼装**：specmate 负责取源码上下文（错误行 + 前后 10 行）、找 3 个最相似已知错误做 few-shot、返回给 Agent。LLM 做推理
- **LLM 做推理，capture 做持久化**：Agent 用 specmate 提供的上下文让自身的 LLM 分析根因和修复方案，通过 `specmate_capture` 入库
- **闭环**：下次同样错误码出现 → `specmate_guide(on_error)` 直接命中 → 返回上次记录的根因和方案
- **相似度匹配**：用错误信息的关键词 + 错误码前缀（P/G/T）在已知错误中找最相似的 3 个作为 few-shot 示例

**子任务**：

- [x] **3.1 已知错误相似度匹配** — 新增 `src/tools/_similarity.mjs`：错误码前缀匹配（P00xx 优先匹配 P00xx）+ 关键词 Jaccard 相似度。返回 top-3 的 code + phenomena + solution 摘要
- [x] **3.2 源码上下文提取** — 新增 `src/tools/_context.mjs`：`extractSourceContext(file, line, contextLines=10)` — 读 .bsv 文件取错误行 ±10 行源码。利用 tree-sitter 定位到最近的 rule/method/function 边界
- [x] **3.3 未知错误响应模板** — `buildUnknownErrorResponse()` 包含：(a) 源码上下文，(b) 3 个最相似已知错误作为 few-shot，(c) 引导 Agent 用 LLM 推理的 prompt
- [x] **3.4 `specmate_guide(on_error)` 未知错误分支** — 当 error code 在 29 篇 doc 中查不到时，走 `findSimilarErrors()` → `buildUnknownErrorResponse()` 上下文拼装模板
- [x] **3.5 `specmate_diagnose` 未知错误批量处理** — 当 diagnose 扫描到未知错误码时，对每个未知错误码独立拼装上下文（源码 + few-shot），在输出中分组排列
- [x] **3.6 capture 自动入库闭环** — Agent 推理后调 `specmate_capture(code, cause, solution)` → 写入 captures 表。下次同错误码调 `on_error` 时直接命中历史记录
- [x] **3.7 server.mjs 集成** — `specmate_diagnose` 和 `specmate_guide(on_error)` 均已接入未知错误分支

---

## 已知问题

### P0 - 致命
- [x] **GPiO Inout 陷阱文本错误** — `0312757` 修复：GPiO 节点 hard 级别 trap #2 改用 BVI 三信号拆分方案（data_in/data_out/oe）。
- [x] **preflight 不做真正的代码检查** — `8b3c9c2` 接入 AST 扫描 P0030/T0043/G0053/G0005，`bdbc780` 新增 G0004 scan。现覆盖 6 种模式。
- [x] **Agent B 不调用 specmate** — 通过 bench 模板 L0 硬约束 + MCP 工具统一入口解决。
- [x] **MCP 工具相对路径静默失败** — `3d8b891` 已修复：所有 8 个 MCP 工具入口加 `validateFilePaths()` 校验。
- [x] **specmate_scan 输出推荐 CLI 命令而非 MCP 工具** — `3d8b891` 已修复：NEXT STEPS 区块改为 `mcp__bsv-specmate__specmate_check` 格式。
- [x] **数据库依赖手动 seed** — `1dbb5d3` 已修复：`ensureDB()` 自动从 `docs/errors/*.md` 填充空 errors 表。
- [x] **captures 表缺少 session_id** — `22afd56` 已修复。
- [x] **specmate_scan 无历史统计** — `f57d4ff` 已修复：capture/resolve 响应中嵌入跨 session 统计指标。
- [x] **parser.mjs 不兼容 heading 格式** — `183bc3f` 已修复：双格式兼容 + smoke test test12 全量验证。

### P1 - 重要
- [x] **P0030 知识库描述不完整** — `8b3c9c2` 修复：summarizeRule 覆盖 function 内 for 循环 return 场景。
- [x] ~~通用陷阱层只含两条~~ — `b1c5d4b` 及 Phase 1-2 已将 TRAPS 数组扩展为 12 条已验证条目。UNIVERSAL_TRAPS 概念已合并入统一 TRAPS 数组。
- [x] **P0005 通用陷阱文字太抽象** — `8b3c9c2` 修复：UNIVERSAL_TRAPS 的 P0005 条目已重写，包含具体错误示范和正确语法。
- [ ] **project-memory.md 知识债跟踪** — 本次（2026-07-18）已大幅同步，但以下 P2 项仍需持续跟踪（见下方 P2 知识债清单）
- [x] **docs/internal-overview.md 过时** — 2026-07-18 已同步：MCP 工具 7→8、TRAPS 2→12、check 规则更新、Phase 0-3 完成状态、P0 全标记已修复。后续负责人每阶段结束时例行更新
- [ ] **安全分类器故障导致 MCP 全部失效** — stdio 传输缓解大部分风险，但前端分类器（deepseek-v4-pro）故障时 MCP 工具链仍阻塞。`knowledge_snapshot.mjs` 提供纯文件后备。

### P2 - 知识债清单（2026-07-18 全貌分析）

> 以下条目按影响程度排序。来源：全貌分析覆盖 `_matcher.mjs` GRAPH/TRAPS、`docs/`、test fixtures、project-memory 已知问题。

#### P2-1: GRAPH 节点内容空洞（结构性）
- **29 个 GRAPH 节点 traps 数组为空** — 知识体系重构后移除所有未验证 trap，仅 fifo 含 1 条。62 条 backlog trap 待验证回填
- **26 个 GRAPH 节点缺 style 字段** — 仅 fifo/pipeline/axi/fsm 四个节点有 style
- **16 个 GRAPH 节点缺 pattern 字段** — reset/struct/union/attribute/interface/rule/method/types/vector/schedule/dma/decoder/timer/gpio/synthesize

#### P2-2: 错误知识库版本兼容性
- [ ] errors.map 中的 P0005 "let 绑定" 建议在 bsc 2025.07 中可能不可用
- [ ] 其余 25 篇 error doc 的代码示例需逐个在 bsc 2025.07 编译验证

#### P2-3: 文档残件
- [ ] **`docs/SHOWDOWN.md`**（675 行）— 旧实验对比报告，`docs/experiments/` 已有更完整记录，可归档
- [ ] **`docs/articles/zhihu-draft.md`** — 知乎草稿，非项目文档，可考虑移出仓库
- [ ] **`docs/experiments/`** — 历史实验记录，作用被 bench 实验数据替代

#### P2-4: 历史遗留问题
- [ ] **Agent B prompt 需强制而非建议** — Agent B 的 prompt 需要改为强制"先调 specmate 再写代码"
- [x] **P2-3: `endSession()` 死代码** — 实际已在 `shutdown()` 中正常调用，非死代码。
- [x] **P2-4: `specmate_resolve` 修复率缺少分隔符** — 已加 `\n`（`a206650`）。
- [ ] **P2-5: commit `22afd56` Co-Authored-By 不一致** — 纯 git 历史 cosmetic 问题，下次 rebase 时顺手修。
- [x] **P2-6: `autoSeedIfEmpty` 缺少文件数量/大小上限** — 已加 `MAX_SEED_FILES = 100` 常量。
- [x] **P2-7: `specmate_capture` 未对其 `files` 参数做路径校验** — 已加 `validateFilePaths()` 校验。
- [ ] **P2-8: `saveDB` 高频全量写盘** — 当前影响不大，随调用量增长再优化。

#### P2-5: 知识条目验证进度
- trap backlog 62 条待验证（P0:5 / P1:16 / P2:41），每日 pipeline 推进缓慢
- 12 条 TRAPS 数组条目已全部验证通过并配有 fixture，但 P0 backlog（fsm-2 / schedule-1 / schedule-2 / arbiter-1 / arbiter-2）仍需 fixture 编译通过才能标记 verified 并回填 GRAPH

#### P2-6: bench 实验验证滞后
- [ ] 修复后的 specmate 尚未在 bench 上重跑实验，12 条已验证 trap 的实际效果未量化

## 关键文件地图

| 文件 | 作用 | 谁改 |
|------|------|------|
| `bin/server.mjs` | MCP 服务器入口 | developer |
| `src/tools/_matcher.mjs` | 知识图谱（30 领域节点 + 2 通用陷阱） | developer |
| `src/tools/specmate_guide.mjs` | 核心工具：scan()【推荐入口】/ pre_code / on_error / continue / decide / pattern + 10 条 DECISIONS | developer |
| `src/tools/_patterns.mjs` | 代码范式模板（15 个） | developer |
| `src/tools/preflight.mjs` | 编译前检查（✅ 已接入 AST 扫描 P0030/P0005/T0043/G0053/G0005/G0004 六种模式） | developer |
| `src/tools/ast_query.mjs` | tree-sitter BSV 解析器（10+ 种分析路由） | developer |
| `src/tools/check_style.mjs` | specmate_check 后端（10 条 always-on + 7 条 full-scan 规则） | developer |
| `src/tools/knowledge_snapshot.mjs` | 离线知识快照导出（纯文件，不依赖 MCP） | developer |
| `src/tools/lookup_ref.mjs` | 参考文档查询 | developer |
| `src/db/parser.mjs` | 错误 Markdown 文件解析器（collectErrorFiles + parseErrorFile） | developer |
| `src/db/query.mjs` | 错误数据库查询（4 表：errors/captures/warnings/ref_hits）+ auto-seed | developer |
| `src/db/seed.mjs` | `npm run db:seed` 手动重建工具（幂等模式） | developer |
| `src/db/schema.mjs` | 数据库表结构 + CRUD 函数 | developer |
| `src/config.mjs` | SPECMATE_LEVEL 配置 + LEVEL_LIMITS | developer |
| `docs/internal-overview.md` | 内部架构总览（技术架构与运行时状态） | specmate 负责人 |
| `docs/knowledge-system-plan.md` | 知识系统优化方案（session/统计/seed） | specmate 负责人 |

## 设计决策及原因

0. **知识条目验证铁律（2026-07-14 议会决议）**：
   - 新增 check 规则必须同时提交对应的 `test/fixtures/check/<rule>/pass.bsv` 和 `fail.bsv`
   - 新增/修改 trap 条目的 `verified` 字段从 `false` 改为 `true` 前，必须提交 `test/fixtures/traps/<trap>.bsv` 且 bsc 编译通过
   - `verified: false` 的条目不出现在任何 Agent 可见的输出中
   - CI 必须跑 `run-fixtures.mjs`，不通过则不允许合并

1. **三级陷阱（hard/quality/style）**：Agent 分不清硬约束和软建议 → 选型时被 style 干扰 → 分三级，不同 mode 显示不同级
2. **通用陷阱层（UNIVERSAL_TRAPS）**：P0030 同时在 fsm/method 节点有声明，但 encoder 任务不匹配到这两个 → Agent 漏掉 P0030 → 改为不依赖关键词匹配的通用层
3. **preflight 接入 AST（Sprint 1 完成）**：preflight 最初设计为"快速预检"，只是数据库查表。Sprint 1 接入 AST（P0030/T0043/G0053/G0005），`bdbc780` 新增 G0004。现覆盖 6 种高频错误模式
4. **findIndex 用 `\== (1)` 部分应用而不是 function lambda**：bsc 2025.07 不支持 `function` 关键字匿名 lambda（P0005）
5. **离线知识快照 (knowledge_snapshot.mjs)**：Round 3 发现安全分类器故障时 specmate MCP 全部失效 → 需要有纯文件后备。`npm run knowledge:snapshot` 将核心知识导出为 Markdown 文件，可被 agent 直接读取或嵌入 bench prompt，不依赖 HTTP/MCP。
6. **知识版本标记规范（2026-07-13 确立）**：所有知识条目默认适用于 BSC 2025.07，通过在 trap 对象上加 `bscVersions: ['2025.07']` 标记。引用旧版 BSC 语法的条目（如 `Inout#()` 包装器）标记为 `bscVersions: ['legacy']` 并注明"仅用于兼容低版本编译器"。每条 trap 同时带 `verified: false` 字段，通过 fixture 编译验证后置 `verified: true` 并追加 `verifiedAt` 时间戳。（`0312757` 提交）
7. **check_style 规则不应以"BSC 覆盖"为由禁用（2026-07-13）**：议会决议指出 4 条规则（checkMultiSubmodule、checkVecUsage、checkBoolBitMismatch、checkValueMethodSyntax）之前以"BSC 100% 覆盖"为由禁用是错误的判断——preflight 的价值正在于在 BSC 编译之前捕获问题，减少 Agent 的试错循环。`bdbc780` 恢复全部 4 条规则。
8. **CLI check 默认 full=true**：之前 CLI 的 `check` 命令默认 `full=false`（仅 4 条 always-on 规则），Agent 只走 `npx specmate check` 会漏检。`bdbc780` 改为默认 `full=true`，确保 Agent 单命令即可获得完整检查。
9. **G0004 preflight 扫描（2026-07-13）**：`scanG0004()` 检测单个 rule 内调用多个子模块 method 的模式。这是 Agent A 在 07-i2c 中 6 轮未能编译通过的直接原因——一个 rule 内同时写 `clk_cnt` 和所有 FSM 寄存器，bsc 判为 G0004 规则内重复写入。`bdbc780` 新增此扫描。
10. **SKILL.md — specmate 交互手册（2026-07-13）**：`SKILL.md` 为 Agent 提供交互速查：8 种场景（开始编码、写完代码、编译失败、不确定语法等）、双通道表格（MCP 工具 vs CLI 命令）。解决 Agent "不知道怎么用 specmate" 的问题。`bdbc780` 新增。
11. **新增 error doc 的 reviewer checklist（2026-07-15）**：审查新增/修改 `docs/errors/*.md` 的改动时，reviewer 必须：(a) 对比 `src/db/parser.mjs` 的 `parseErrorFile()` 正则，确认文档格式与解析器兼容；(b) 确认 `scripts/smoke-test.mjs` 的 test12（parser 全量验证）能通过。缺失任一步骤，改动不得合并。此条源于 P0022/P0200/G0036 格式不兼容导致 11 篇文档完全无法解析入库的 P0 事故。

## 实验数据

- 04-priority-encoder Round 1：Agent A 40% vs Agent B 35%（specmate 指导了错误模式）
- 04-priority-encoder Round 2：Agent A 100%（编译通过但代码用 Wire + put_val）vs Agent B P0030（代码更优雅但编译失败）
- 盲审结果：X (Agent A) 20/30 vs Y (Agent B) 24/30 — specmate 让代码"看起来更好"但编译挂
- 结论：specmate 的高层指导生效了（设计更优雅），但缺少编译前语法模式检查
- 04-priority-encoder Round 3：Agent A 和 Agent B 均触发 P0005 — 都写了 `genWith(function(Integer i); return requests[i]; endfunction)`。Agent B 虽读了 project-memory 避开了 P0030，但安全分类器 deepseek-v4-pro 挂了导致完全无法调 specmate MCP 工具
- Round 3 关键发现：(1) 安全分类器不稳定时 specmate 全部失效——MCP 依赖 HTTP 调用被分类器拦截；(2) P0005 在 UNIVERSAL_TRAPS 中有文字警告但太抽象（只说"不用 function 关键字"，未给具体错误代码对比），agent 看过后仍然写错；(3) 需要离线知识快照——纯文件输出不依赖 MCP

---

## 架构决策（2026-07-12 最终确定）

### 架构文档

**架构定义见 `docs/architecture.md`（2026-07-12 最终确定）。**

任何未来的 specmate 负责人 agent 在读取本文件时，必须同时阅读 `docs/architecture.md` 以理解已确定的架构决策。architecture.md 是稳定的决策记录——写完后不常改。当前执行状态和进行中的工作见本文档（project-memory.md）。

### 架构讨论完成 → 架构定位裁定（议会 S02E03，2026-07-14）

> ⚠️ 2026-07-14 议会 S02E03 裁定：**推翻了 2026-07-12 的 CLI 主通道决策。**

经过 bench 实验验证和议会讨论，specmate 的最终定位已确定：

- **MCP 为 Agent 唯一正式通道**：7 个 MCP 工具是 AI Agent 使用 specmate 的唯一入口。`specmate_scan` 是推荐统一入口，替代旧的 guide(pre_code)+decide+preflight 三步调用。
- **CLI 降级为人类调试辅助**：`npx specmate scan/check` 仅供人类开发者手动调试和快速验证。Agent **不应**通过 Bash 执行 `npx specmate` 命令——应通过 MCP 工具调用。
- **路径要求**：MCP 工具需要**绝对路径**，相对路径会静默失败（已知问题，待修复）。Agent 传入文件路径前必须拼出完整路径。

### 旧架构决策（2026-07-12，已被 S02E03 推翻）

以下为历史记录，仅供参考：

- ~~CLI 成为主通道~~：Agent 通过 `npx specmate scan/check/compile` 调用 specmate → **推翻**：CLI 仅人类使用
- ~~MCP 降为辅助层~~：仅 `specmate_analyze` 和 `specmate_resolve` 保留为 MCP → **推翻**：MCP 是 Agent 唯一通道
- ~~Agent 无法跳过 specmate~~：bench scaffold 不暴露 bsc，只暴露 specmate CLI → **修订**：通过 bench 模板中的 L0 硬约束确保 Agent 调用 MCP specmate_scan / specmate_check

### 三个 P0 问题的处理决定（修订于 2026-07-14）

| P0 | 问题 | 处理决定 |
|----|------|---------|
| P0-1 preflight 不做代码检查 | ✅ Sprint 1 已修复（preflight 接入 AST 扫描）。specmate_scan 统一入口整合 preflight + matcher + patterns + DECISIONS |
| P0-2 Agent 不调用 specmate | **通过 bench 模板 L0 硬约束解决**：Agent 编码前必须调 specmate_scan、编码后必须调 specmate_check。验证体系落实铁律 |
| P0-3 安全分类器拦截 MCP | **通过 stdio 传输缓解**：MCP server 默认 stdio 传输（`SPECMATE_TRANSPORT=stdio`），不经过安全分类器。HTTP 模式可选（端口 9339） |

### Phase 当前阶段

当前阶段：**Q3+Q4 路线图全部完成 ✓ — 下一步：实际使用验证 + trap 验证推进**

已完成：
- ✅ Q3: MCP Elicitation + BSC Orchestration + 未知错误 LLM 分析
- ✅ Q4: Streaming 流式输出 + MCP Registry 注册

下一步优先事项：
1. **实际使用验证** — 在当前项目中实际使用 specmate，收集真实反馈
2. **trap 每日验证 pipeline** — 62 条 backlog 逐步推进，目标两个月清空
3. **bench 重跑** — 用量化数据验证 Q3+Q4 改动的实际效果

相关文档：
- `docs/architecture.md` — 完整架构决策文档
- `docs/internal-overview.md` — 内部架构总览（技术架构与运行时状态，每阶段更新）
- `docs/knowledge-system-plan.md` — 知识系统优化方案（session/统计/seed 三个问题的实施细节）
- `D:/Desktop/bsv-agent/specmate_bench/CLAUDE.md` — bench 实验平台（scaffold + L0 注入）

## 功能冻结（2026-07-13）

> 基于负责人 + 顾问双线分析共识：specmate 核心能力退化（从 pull+示例 → push+规则），在核心工具恢复并被 bench 实验验证有效之前，冻结以下扩张：

- **不再加 GRAPH 节点** — 当前 30 节点已足够，质量 > 数量
- **不再加 trap 元数据字段** — bscVersions/verified 仅在 fixture 编译验证体系启用后使用
- **不再加推送机制** — push 模型是行业验证过的反模式，专注 pull 通道

冻结期间允许：
- 修复致命遗漏（如 lookup_example 恢复、AGENTS.md 精简）
- 完善 CLI 工具（scan/check）
- 优化 bench scaffold（L0 注入）

冻结解除条件：bench 完成 3 场有效实验（含修复后的 07-i2c），数据显示 specmate 编译通过率 ≥ Agent A 且代码质量（盲审）高于 Agent A。

## 顾问建议评估

| 建议 | 优先级 | 决定 | 说明 |
|------|--------|------|------|
| GRAPH 热度驱动修剪 | P2 | 冻结解除后评估 | 为 GRAPH 节点加命中计数，低热度节点降级。与 kova "知识越用越强"理念一致，当前基础设施（ref_hits 表）已有热度追踪 |
| GRAPH 节点关联示例路径 | P1 | 冻结解除后优先 | 每个 GRAPH 节点预置 1-3 个 examples/bsv/ 文件路径。与 lookup_example CLI 形成"搜索 + 预置引用"双通道，"证明而非告诫" |
| L0 A/B 分层测试 | P1 | 路由给 bench 负责人 | 在 bench 平台设计三组对照：L0-only vs L0+GRAPH vs L0+examples，精准测量每层知识增量贡献。非 specmate 本体改动
