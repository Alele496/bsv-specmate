# specmate 内部架构总览

> 维护者：specmate 负责人
> 最后更新：2026-07-18
> 维护原则：每个阶段结束时更新一次（不是每次提交都改）

> 关系说明：本文档是**技术架构和运行时状态**。`project-memory.md` 是**项目管理和任务跟踪**。两者互补。

---

## 1. 仓库架构表

```
bsv-agent-server/                  # npm 包根目录（bsv-specmate）
├── bin/
│   ├── server.mjs                 # MCP 服务器入口（8 个工具定义 + HTTP/stdio 双传输）
│   └── cli.mjs                    # CLI 入口（5KB，npx specmate scan/check，仅供人类调试）
├── src/
│   ├── config.mjs                 # SPECMATE_LEVEL 配置 + LEVEL_LIMITS + 数据目录管理
│   ├── notify.mjs                 # MCP notification 桥接（@dormant，保留基础实现）
│   ├── db/
│   │   ├── schema.mjs             # 数据库表结构定义 + CRUD 函数（4 表：errors/captures/warnings/ref_hits）
│   │   ├── query.mjs              # 数据库查询接口（对外导出的异步封装）
│   │   ├── seed.mjs               # db:seed 脚本 — 从 Markdown 错误文档重建数据库
│   │   ├── export.mjs             # db:export 脚本 — 导出数据库内容为 Markdown
│   │   └── query.test.mjs         # 数据库查询单元测试
│   ├── tools/
│   │   ├── _matcher.mjs           # 知识图谱（12 条 TRAPS 数组 + 30 GRAPH 节点 + phase 过滤 + mode 过滤）
│   │   ├── _matcher.test.mjs      # matcher 单元测试
│   │   ├── _patterns.mjs          # BSV 代码范式模板（15 个：fifo/bram/fsm/pipeline/spi/uart 等）
│   │   ├── specmate_guide.mjs     # 核心工具 — scan() 统一入口 + guide(pre_code/on_error/decide/pattern/continue) + DECISIONS 表
│   │   ├── preflight.mjs          # 编译前 AST 扫描（6 种模式：P0030/P0005/T0043/G0053/G0005/G0004）+ COMMON_WARNINGS
│   │   ├── check_style.mjs        # specmate_check 后端（10 条 always-on + 7 条 full-scan 规则）+ specmate_diagnose.mjs（编译日志全量诊断）
│   │   ├── ast_query.mjs          # tree-sitter BSV 解析器（调度分析/冲突矩阵/依赖图/调用图/寄存器分析/方法分析/行查询）
│   │   ├── ast_query.test.mjs     # AST 查询单元测试
│   │   ├── knowledge_snapshot.mjs # 离线知识快照导出（纯 Markdown，不依赖 MCP）
│   │   ├── lookup_ref.mjs         # 参考文档查询
│   │   ├── lookup_error.mjs       # 错误码详情查询
│   │   ├── lookup_example.mjs     # BSV 示例代码搜索
│   │   ├── suggest.mjs            # 代码建议引擎
│   │   ├── warning_diff.mjs       # BSC warning 解析器
│   │   ├── coding_rules.mjs       # 编码规则定义
│   │   ├── add_error.mjs          # 错误码手动添加（仅 db:seed 使用，非 MCP 工具）
│   │   ├── specmate_diagnose.mjs  # Phase 3 新增 — BSC 编译日志全量诊断（第 8 个 MCP 工具）
│   ├── push/
│   │   └── alerts.mjs             # SPP 推送协议（@dormant，6 个函数保留为 no-op shells）
├── test/
│   ├── fixtures/
│   │   ├── check/                 # check 规则 fixture 文件（8 个规则各 pass.bsv + fail.bsv）
│   │   │   ├── G0004/ G0053/ G0054/ P0022/ P0200/
│   │   │   ├── always-attr-misuse/ bool-interface-return/
│   │   │   └── synthesize-annotation-order/
│   │   ├── traps/                 # trap 验证 fixture 文件
│   │   │   ├── _compile.sh        # 编译辅助脚本
│   │   │   ├── fifo-1.bsv / fsm-1.bsv / axi-1.bsv  # ✅ backlog 已验证
│   │   │   └── trap-*.bsv (10 个) # ✅ TRAPS 数组 fixture 文件
│   │   └── run-fixtures.mjs       # fixture CI 脚本
│   └── knowledge-validation.test.mjs  # 知识质量验证测试（7 项检查）
├── docs/
│   ├── architecture.md            # 架构决策文档（2026-07-12 最终确定，写后不改）
│   ├── agent-integration.md       # Agent 集成指南
│   ├── trap-verification-backlog.md # trap 验证 backlog（65 条，3 已验证）
│   ├── BSV-STYLE.md               # BSV 代码风格规范
│   ├── errors/                    # 错误码文档（26 篇 .md + INDEX.md）
│   ├── reference/                 # 参考文档
│   └── experiments/               # 实验数据
├── data/
│   ├── knowledge.db               # 预置数据库种子（24KB）
│   └── testsuite-errors.json      # bsc 测试套件错误数据
├── scripts/
│   ├── smoke-test.mjs             # 烟雾测试（12 用例）
│   ├── health-check.mjs           # 系统健康检查
│   ├── verify-traps.mjs           # trap 验证状态查询（支持 --csv/--json/--count）
│   ├── audit-knowledge.mjs        # 知识审计：遍历 GRAPH/TRAPS/errors/doc 检查完整性
│   ├── generate-error-doc.mjs     # 错误文档自动生成
│   ├── test-push.mjs              # 推送测试
│   └── parse-testsuite.mjs        # bsc 测试套件解析
├── .husky/
│   └── pre-commit                 # Git pre-commit hook（自动 npm test + fixtures）
├── examples/                      # BSV 示例代码（bsc 官方 + 自定义）
└── SKILL.md                       # specmate 交互手册（Agent 速查）
```

---

## 2. MCP 工具速查表

| # | 工具 | 参数 | 用途 | 状态 |
|---|------|------|------|------|
| 1 | **specmate_scan** | `task`(string, 必填), `file`(string, 可选) | **推荐统一入口** — 一次性返回 TRAPS 数组 + preflight AST 扫描 + NEXT STEPS。替代旧的 guide(pre_code)+decide+preflight 三步调用 | 可用。NEXT STEPS 已改为 MCP 工具调用格式 |
| 2 | **specmate_guide** | `phase`(enum: pre_code/on_error/continue/decide/pattern), `input`(string), `file`(string, 可选) | 细分阶段指导 — pre_code 编码前陷阱、on_error 错误诊断、decide 设计决策、pattern 代码骨架 | 可用。decide() 已关闭。pre_code() 仅输出 TRAPS 数组已验证条目（12 条） |
| 3 | **specmate_check** | `files`(string[], 必填), `full`(boolean, 默认 false) | 编译前静态检查 — 10 条 always-on + 7 条 full-scan 规则（含 P0/P1/P2 知识盲区修复新增 4 条）。路径校验已实现 | 可用 |
| 4 | **specmate_capture** | `bsc_output`(string, 必填), `files`(string[], 可选) | 解析 bsc 编译器输出，提取错误码，自动入库 captures 表（含 session_id）。响应中嵌入跨 session 统计（历史出现次数 + 修复率） | 可用 |
| 5 | **specmate_resolve** | `code`(string), `cause`(string), `solution`(string) | 修复后固化经验 — 标记 capture 为 resolved，记录根因和方案。响应中嵌入修复率变化统计 | 可用 |
| 6 | **specmate_analyze** | `files`(string[], 必填), `question`(string, 必填) | AST 深度分析 — 调度冲突矩阵、跨 rule 冲突、依赖图、调用图、寄存器分析、方法分析、行级节点查询。10+ 种分析路由 | 可用 |
| 7 | **specmate_diff** | `bsc_output`(string, 可选), `action`(enum: snapshot/diff) | Warning 追踪 — snapshot 存储编译警告，diff 对比两次快照差异 | 可用 |
| 8 | **specmate_diagnose** | `bsc_output`(string, 必填), `files`(string[], 可选) | **Phase 3 新增** — 接收 BSC 完整编译日志，全量扫描所有错误码/警告，逐个匹配知识库并输出诊断。解决 Agent 多次往返 guide(on_error) 的低效问题 | 可用 |

### 当前 MCP 工具总状态

- **全部 8 个工具可用**，无 bug 导致的不可用
- **specmate_learn 已移除**（Phase 1 废弃）。capture + resolve 自动化流程完全覆盖
- **specmate_diagnose**（Phase 3 新增）— 一次性诊断 BSC 全量编译输出，减少 Agent 多次往返
- **路径校验**：所有工具入口已实现 `validateFilePaths()`，绝对路径校验 + 文件存在性检查
- **session 管理**：captures 表已有 session_id，跨 session 统计已嵌入 capture/resolve 响应

---

## 3. 内部自动计数/统计

| 指标 | 存在哪张表 | 触发时机 | 计数方式 |
|------|----------|---------|---------|
| **错误码命中次数** | `errors.count` | `specmate_guide(phase=on_error)` 调 `hitError(code)` + `specmate_check` 每次发现 issue 调 `hitError(code)` | `UPDATE errors SET count = count + 1 WHERE code = ?` |
| **参考文档热度** | `ref_hits.count` | `lookup_ref(topic)` 调 `trackRefHit(topic)` | `INSERT OR CONFLICT UPDATE SET count = count + 1` |
| **错误捕获记录** | `captures` (每行一条) | `specmate_capture` + `specmate_guide(on_error)` + `specmate_scan` preflight 发现问题时 auto-capture | `INSERT INTO captures` |
| **捕获解决状态** | `captures.status` | `specmate_resolve` 调 `resolveCaptureById()` | `UPDATE captures SET status = 'resolved'` |
| **Warning 快照** | `warnings` | `specmate_diff(action=snapshot)` | `INSERT OR IGNORE INTO warnings` |

### 已实现的统计（Phase 0-3 完成）

- **跨 session 历史统计**：`specmate_capture` 响应中显示该错误码历史出现次数（`COUNT(DISTINCT session_id)`）和修复率（`resolved/total`）
- **session 管理**：`initSession()` 自动生成 UUID，captures 表含 session_id 字段
- **修复率变化**：`specmate_resolve` 响应中显示修复率变化（如 `修复率: 3/5 (60.0%)`）
- **capture/check 去重**：同一 session 内同一错误码只记录一次，同一次 check 调用中同一规则只报告一次
- **auto-cluster**（Phase 1）：相同错误码的多次 capture 自动聚合为 cluster，保留历史轨迹

---

## 4. 错误知识库状态

### errors 表

- **收录错误码数**：29 个（`docs/errors/` 目录下 29 篇 .md 文档 + INDEX.md）
- **计数器状态**：每个 `errors.code` 有 `count` 字段（初始种子值 1-6，运行时累积递增）
- **格式统一**：`6303901` 全部 29 篇统一为标准 `## 现象`/`## 原因`/`## 解决方案`/`## 规则` 四段式 + `> 适用 BSC 版本: 2025.07`
- **parser 兼容**：`183bc3f` 支持粗体 + Markdown 标题双格式解析

### captures 表

- **记录数**：需查数据库获取实时数据（`~/.specmate/data/knowledge.db`）
- **状态分布**：resolved / unresolved（精确数字需查数据库）
- **最近捕获**：取决于 specmate 的使用频率

### 错误文档列表（29 篇）

P 系列（7 篇）：P0005, P0022, P0030, P0032, P0073, P0085, P0200
G 系列（11 篇）：G0002, G0004, G0004_FSM, G0005, G0010, G0030, G0036, G0040, G0053, G0054, G0124
T 系列（10 篇）：T0004, T0011, T0016, T0030, T0043, T0051, T0060, T0061, T0132, T0144
其他：BSV-PORTS

---

## 5. 最近改动（本阶段：2026-07-14）

### 知识体系重构（议会 S02E03 决议落地）

提交：`9972cf2` + `04dc98d`，影响 9 个文件：

| 改动 | 文件 | 影响 |
|------|------|------|
| 砍掉未验证 trap 输出 | `_matcher.mjs` formatTrapsOutput() | verified:false 的 GRAPH trap 不输出，仅 UNIVERSAL_TRAPS 保留 |
| 关闭主动指导 | `specmate_guide.mjs` preCode() / scan() | 仅输出 UNIVERSAL_TRAPS + preflight AST + 明确告知不做主动指导 |
| decide() 返回不可用 | `specmate_guide.mjs` decide() | 从 10 条查表变成硬编码"不可用"消息 |
| 修复 4 条 P0 错误 | `_matcher.mjs` + `preflight.mjs` | "done 用 Bool" 改为 Bit#(1) + G0005 文本修正 |
| 新增 2 条 check 规则 | `check_style.mjs` | checkInterfaceBoolReturn + checkAlwaysAttrMisuse（always-on） |
| fixture 验证体系 | `test/fixtures/check/` | 2 个规则的 pass/fail fixture + run-fixtures.mjs（4/4 通过） |
| 知识条目验证铁律 | CLAUDE.md + project-memory.md | 4 条铁律写入项目公共信息 |
| Agent B 模板切换 | `specmate_bench/templates/agents-autonomous.md` | 5 步命令式 → 3 步检查式 |

### 为什么这样改

specmate 的 trap 知识库（65 条未验证条目）未经 bsc 编译验证就输出给 Agent，存在两个风险：误导 Agent（给定的建议可能过时）和损害 specmate 的可信度。重构方向是从"什么都说的建议系统"变为"只说确认过的 + 代码级验证"。

---

## 6. 当前 TOP 错误（根据 errors 表 count 字段）

以下来自 `docs/errors/INDEX.md` 中的初始种子计数（运行时计数需查数据库）：

| 排名 | 错误码 | 标题 | 种子计数 |
|------|--------|------|---------|
| 1 | P0005 | 标识符与 SV 保留字冲突 | 6 |
| 2 | G0010 | 跨 rule 方法调用冲突 | 3 |
| 3 | P0032 | rule/method 顺序 | 2 |
| T4 | T0051 | literal 超出位宽 | 2 |
| T4 | T0061 | Bool/Bit 类型混淆 | 2 |
| T4 | G0004 | rule 内并行写冲突 | 2 |

**注**：运行时计数因 `hitError()`（每次 on_error 查询和 check 发现问题时自动 +1）而持续增长。实际当前 count 值可能高于种子值。P0005 始终是最高频错误——这与 bench 实验中多个 Agent 触发 P0005 的数据一致。

---

## 7. 已知问题

### P0 — 致命

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| P0-1 | **MCP 工具相对路径静默失败** | Agent 传入相对路径 → specmate 不报错、不返回错误，直接返回空结果 | ✅ `3d8b891` 修复：所有工具入口加 `validateFilePaths()` |
| P0-2 | **specmate_scan 输出推荐 CLI 命令** | 议会裁定 CLI 仅人类调试，Agent 应走 MCP | ✅ `3d8b891` 修复：NEXT STEPS 改为 MCP 格式 |
| P0-3 | **captures 表缺少 session 概念** | 无法区分不同任务的捕获记录 | ✅ `ecce5d2` 修复：session_id + initSession() |
| P0-4 | **specmate_scan 无历史统计** | Agent 看不到历史经验 | ✅ `f57d4ff` 修复：capture/resolve 响应嵌入统计 |

### P1 — 重要

| # | 问题 | 状态 |
|---|------|------|
| P1-1 | 通用陷阱层扩展 | ✅ 通过 TRAPS 数组（12 条已验证条目）已实现，旧 UNIVERSAL_TRAPS 概念合并入统一数组 |
| P1-2 | 16 个知识图谱节点缺乏 style/pattern | 功能冻结期间暂不处理。实际 26 个缺 style、16 个缺 pattern |
| P1-3 | 安全分类器故障导致 MCP 工具链阻塞 | stdio 传输缓解大部分风险，前端分类器（deepseek-v4-pro）偶尔不可用影响 Bash 操作 |

### P2 — 改善

| # | 问题 |
|---|------|
| P2-1 | P0005 的 "let 绑定" 建议在 bsc 2025.07 中不可用 |
| P2-2 | Agent B 的 prompt 需要强制"先调 specmate 再写代码"而非建议 |
| P2-3 | specmate_scan 目前输出过于朴素（仅 3 个段落），缺少正式的结构化格式化 |

---

## 8. 数据库状态

| 属性 | 值 |
|------|-----|
| 路径 | `~/.specmate/data/knowledge.db` |
| 预置种子 | `data/knowledge.db`（24KB，npm publish 时包含） |
| 引擎 | sql.js（SQLite WASM 实现，无需原生 sqlite3） |
| 表数 | 4 张 |
| 迁移状态 | query.mjs 的 ensureDB() 会自动创建 captures/warnings 表（兼容旧 DB 升级） |

### 表结构

```
errors:    id(INT PK) | code(TEXT UNIQUE) | title(TEXT) | keywords(TEXT) |
           phenomena(TEXT) | cause(TEXT) | solution(TEXT) | rules(TEXT) | count(INT)

ref_hits:  topic(TEXT PK) | count(INT)

captures:  id(INT PK) | code(TEXT) | timestamp(TEXT) | bsc_output(TEXT) |
           files(TEXT) | cause(TEXT) | solution(TEXT) | status(TEXT) | session_id(TEXT)

warnings:  id(INT PK) | snapshot_id(TEXT) | timestamp(TEXT) | file(TEXT) |
           line(INT) | code(TEXT) | message(TEXT)
           UNIQUE(snapshot_id, file, line, code)
```

### 记录数（准确数字需查数据库）

| 表 | 大致记录数 |
|----|-----------|
| errors | 29 行（种子数据，29 个错误码） |
| captures | 取决于使用频次（每次 on_error / capture / preflight auto-capture 增加一行） |
| warnings | 0-若干（取决于 specmate_diff snapshot 调用次数） |
| ref_hits | 取决于 lookup_ref 调用次数 |

---

## 9. 知识图谱状态

### GRAPH（_matcher.mjs）

- **30 个领域节点**：fifo, pipeline, clock, reset, axi, bram, fsm, bvi, spi, crc, uart, struct, union, attribute, interface, rule, method, types, vector, schedule, regfile, arbiter, serialize, interrupt, dma, encoder, decoder, timer, gpio, synthesize
- **12 条 TRAPS 数组（统一知识基）**：P0030/P0005/Bool vs Bit/G0004/G0053/interface Bool/always_ready guard/P0022/Vector 构造/PulseWire + Reg/urgency/跨时钟域。全部 `verified: true`，每条配 fixture + 代码验证
- **trap 分级**：hard（不遵守编译错误）/ quality（影响硬件正确性）/ style（代码风格偏好）
- **phase 标签**：design（架构阶段）/ code（编码阶段）/ both（通用）
- **验证状态**：12 条 TRAPS 数组 = verified:true | 65 条 GRAPH backlog = 3 已验证（fifo-1/fsm-1/axi-1），62 待验证，29 个 GRAPH 节点 traps 数组为空
- **bsc 版本标记**：所有 trap 已加 `bscVersions: ['2025.07']`

### DECISIONS（specmate_guide.mjs）

- **10 条查找表**：mkFIFO vs mkBypassFIFO / FIFO 变体选择 / BRAM vs BRAMCore / Reg vs ConfigReg / Wire vs Reg / mkRegFile vs mkRegFileFull / StmtFSM vs 手写 / 跨时钟域 / Bool vs Bit#(1) / 流水线级间数据传递
- **当前状态**：`decide()` 已关闭（返回"不可用"消息）。查找表代码保留在源文件中
- **关键词匹配**：所有关键词都出现才命中，fallback 到 GRAPH 节点匹配

### PATTERNS（_patterns.mjs）

- **15 个代码范式模板**：fifo, bram, pipeline, clock_cross, axi_stream, fsm, bvi, spi, crc, uart, regfile, arbiter, serialize, interrupt, encoder
- 每个模板含 skeleton（代码骨架）、variants（变体选择）、traps（相关陷阱）、cross（参考文档）

---

## 10. SPECMATE_LEVEL 配置

| 模式 | mode | 可见陷阱级别 | pushPreCode | pushCheckStyle | pushOnError | pushDiff | pushAnalyze |
|------|------|------------|-------------|----------------|-------------|----------|-------------|
| **verify** (silicon) | passive | 仅 hard | 关 | 关 | 关 | 关 | 关 |
| **develop** (wafer) | suggestive | hard + quality | 开 | 关 | 关 | 关 | 关 |
| **tapeout** | collaborative | hard + quality + style | 开 | 开 | 开 | 开 | 开 |

当前环境：`SPECMATE_LEVEL=develop`（默认）

---

## 11. 下一步计划

### 当前阶段：验证层建设（Phase 0-3 已完成）

1. **知识系统优化 P0**（见 `docs/knowledge-system-plan.md`）：
   - [x] captures 表加 session_id 字段 + 自动生成逻辑（`ecce5d2`）
   - [x] specmate_capture/resolve 响应嵌入历史统计段落（`f57d4ff`）
   - [x] capture/check 去重 + auto-seed（`1dbb5d3`/`22afd56`）

2. **trap 每日验证 pipeline**（持续进行中）：
   - [x] 12 条 TRAPS 数组条目全部通过代码验证 + fixture
   - [ ] 65 条 backlog，已验证 3 条，P0 剩余 5 条（fsm-2 / schedule-1 / schedule-2 / arbiter-1 / arbiter-2）
   - [ ] 每天至少验证 3 条，按 P0 → P1 → P2 消耗 backlog

3. **MCP 路径校验**：
   - [x] 所有 8 个 MCP 工具入口已实现 `validateFilePaths()` 绝对路径校验（`3d8b891`）

4. **bench 实验重跑**：
   - [ ] 用修复后的 specmate 重跑基准实验，验证 12 条已验证 trap + P0/P1/P2 知识盲区修复的效果

5. **CI 自动化**：
   - [x] husky pre-commit hook 已配置（`906c275`），自动运行 `npm test` + fixtures

6. **Phase 2+3 新增能力**：
   - [x] specmate_diagnose — 全量编译日志诊断（`eea5048`）
   - [x] 知识管道冲突检测 + 知识审计脚本（`7ca2c60`）
   - [x] P0/P1/P2 知识盲区修复（`15d1496`/`b1c5d4b`）

---

## 12. 相关文档索引

| 文档 | 路径 | 作用 |
|------|------|------|
| 架构决策 | `docs/architecture.md` | 已确定的架构决策（2026-07-12 最终确定） |
| 项目记忆 | `project-memory.md` | 当前执行状态、进行中的工作、任务跟踪 |
| 知识系统方案 | `docs/knowledge-system-plan.md` | 三个问题（去重/统计/seed）的实施方案 |
| trap backlog | `docs/trap-verification-backlog.md` | 65 条 trap 验证清单 |
| Agent 集成 | `docs/agent-integration.md` | Agent 如何与 specmate 交互 |
| SKILL.md | `SKILL.md` | Agent 交互手册（MCP 工具 vs CLI 命令速查） |
| 错误索引 | `docs/errors/INDEX.md` | 26 个错误码索引 |
