# specmate 架构全景：六大方向

> 2026-07-18 | 按用户要求，将 specmate 功能**按方向重组**，标注每个模块的活跃状态和被谁调用。

---

## 方向一：知识引擎 🧠

> **specmate 的核心护城河。** BSV 领域知识的存储、检索、积累。SQLite 驱动，越用越强。

| 模块 | 文件 | 状态 | 说明 |
|------|------|:---:|------|
| **知识库（SQLite）** | `src/db/schema.mjs` | 🟢 活跃 | errors + captures + sessions + warnings + ref_hits 五张表 |
| **数据访问层** | `src/db/query.mjs` | 🟢 活跃 | 统一 DB 访问入口，session 生命周期管理，批量操作 |
| **知识种子** | `src/db/parser.mjs` + `src/db/seed.mjs` | 🟢 活跃 | 从 `docs/errors/` 的 Markdown 文件自动解析入库 |
| **自动计数** | `hitError()` in query.mjs | 🟢 活跃 | 每次 check_style 命中 → errors.count +1 |
| **跨 session 统计** | `queryTopErrorCodes()` / `queryErrorCodeStats()` | 🟢 活跃 | TOP 5 高频错误码，跨 session 计数 |
| **Session 追踪** | `ensureSession()` / `endCurrentSession()` | 🟢 活跃 | MCP 连接时自动创建，关闭时自动结束 |
| **Elicitation 状态** | `getCurrentSessionPhase()` | 🟢 活跃 | 持久化 Agent 当前设计阶段（design/code/debug） |

**数据流**：
```
MCP 连接 → auto-create session
   ↓
check_style 命中 → hitError() count+1
capture         → upsertCapture() (dedup: 同 session+同文件→count+1)
diagnose        → addCapturesBatch() 批量入库
resolve         → capture.status = 'resolved'
   ↓
MCP 断开 → auto-end session
```

---

## 方向二：MCP 工具层 🔌

> **Agent 唯一正式通道。** 8 个 MCP 工具，覆盖 BSV 编码全周期。

| 工具 | 文件 | 状态 | 入口/频率 |
|------|------|:---:|------|
| **specmate_scan** ⭐ | `src/tools/specmate_guide.mjs` → `scan()` | 🟢 活跃 | 推荐统一入口，编码前调用 |
| **specmate_guide** | `src/tools/specmate_guide.mjs` → `guide()` | 🟢 活跃 | 分阶段指导（pre_code/on_error/continue/pattern） |
| **specmate_check** | `src/tools/check_style.mjs` → `checkStyle()` | 🟢 活跃 | 写完代码→静态检查，可选 `compile=true` 集成 bsc |
| **specmate_diagnose** | `src/tools/specmate_diagnose.mjs` | 🟢 活跃 | 编译后一屏幕红→全量诊断 |
| **specmate_capture** | server 内联实现 | 🟢 活跃 | 编译报错→自动入库 |
| **specmate_resolve** | server 内联实现 | 🟢 活跃 | 修好后→固化根因和方案 |
| **specmate_analyze** | `src/tools/ast_query.mjs` | 🟢 活跃 | 深度 AST 分析（调度/冲突/依赖） |
| **specmate_diff** | server 内联实现 + `src/tools/warning_diff.mjs` | 🟢 活跃 | 编译变化追踪 |

**工作流**：
```
拿到任务 → scan(预测陷阱) → 写代码 → check(静态扫描) → bsc编译
  ├─ 通过 → resolve(固化) ✅
  └─ 报错 → diagnose(诊断) → capture(入库) → 修复 → 回到编译
```

**弃用工具**：
| `specmate_learn` | `src/tools/specmate_learn.mjs` (53B 空壳) | 🔴 已弃用 | Phase 1 移除，被 capture+resolve 替代 |
| `add_error` | `src/tools/add_error.mjs` | 🟡 仅 CLI | 保留用于 `db:seed` 脚本，不作为 MCP 工具 |

---

## 方向三：静态检查 🧹

> **编译前的第一道防线。** 分秒级正则扫描和 tree-sitter AST 扫描两条独立路线。

### 路线 3a：正则快速扫描（check_style.mjs）

| 级别 | 规则数 | 触发方式 | 说明 |
|------|:------:|------|------|
| **Always-on（11 条）** | P0030, T0061, T0132, G0053, G0004_FSM, T0004, T0061, P0005 check, Bool operators check, interface-bool-return, always-attr-guard-conflict, P0022 | `full=false`（默认） | BSC 覆盖不到或覆盖不精确的语义规则 |
| **Full-scan（8 条）** | G0004(WAW), 重复类型参数, 重复属性, urgency循环, 规则名未定义, 函数参数数量, P0200(BVI schedule), G0010(synthesize后注解) | `full=true` | 需显式传参才启用 |

**关键事实**：11 条 always-on + 8 条 full-scan **全部是正则**，从未 `import { ... } from './ast_query.mjs'`。唯一例外是 `isCaseFsmPattern()` 的正则 G0004 误报检测。

**设计意图**：正则作为"快速 first pass"——兼容残缺/格式错误的代码（tree-sitter 解析会失败），秒出结果。精确度不如 AST 但覆盖面广。

### 路线 3b：tree-sitter AST 扫描（preflight.mjs）

| 覆盖 | 技术 | 调用方 |
|------|------|------|
| P0030, P0005, G0004, G0005, G0053, T0043 | tree-sitter 真解析 | specmate_guide(pre_code), specmate_scan |

**关键事实**：preflight.mjs 用 tree-sitter，但和 check_style.mjs 有规则重叠（都查 G0004）。两条路线独立运行，没有被统一调度。

### 路线 3c：深度 AST 分析（ast_query.mjs）

| 功能 | 调用方 | 说明 |
|------|------|------|
| 调度冲突分析 | specmate_analyze | 多子模块分析、冲突对检测 |
| 依赖图/调用图 | specmate_analyze | 模块实例化关系、方法调用链 |
| 寄存器追踪 | specmate_analyze | 寄存器声明、读写者分析 |
| 跨 rule 冲突矩阵 | specmate_analyze | 方法调用顺序、隐式冲突 |
| 行级查询 | specmate_analyze | "第156行是什么" |

**速率限制**：扫描结果缓存在全局 Map，避免重复解析同一文件。

### 三条路线的状态总结

```
check_style.mjs (19 rules, regex) ──┐
                                     ├── 都查 .bsv 文件
preflight.mjs  (6 rules, tree-sitter)┘      ┃
                                     ┃ 互不调用 ┃
ast_query.mjs  (full analysis, tree-sitter)
```

**设计说明（议会决议）**：不是 bug——是有意的分工。check_style 追求速度+容错，preflight 追求精度，ast_query 追求深度。不改正则→tree-sitter（ROI 太低），而是加 `confidence` 字段让 Agent 知道每个规则的"可信度"。

### 何时用哪条路径

Agent 面对 specmate 的三条检查路径时，按以下决策树选择：

```
Agent 应该调用哪个？
  ├── 编码前、拿到新任务 → specmate_scan（自动走 preflight AST 扫描）
  ├── 写完一段代码、编译前 → specmate_check（走 check_style 正则 + 可选 compile=true 走 BSC）
  └── 编译通过但有调度疑问、依赖关系不清楚 → specmate_analyze（走 ast_query 深度分析）
```

**详细说明**：

| 阶段 | 调用工具 | 底层路线 | 为什么 |
|------|---------|---------|--------|
| **编码前** | `specmate_scan` | preflight (tree-sitter) | 拿到任务后先扫一遍已有代码，提前暴露 P0030、P0005、G0004 等硬约束，避免写到一半才发现方向错误。scan 内部自动调 preflight 做 AST 扫描。 |
| **写完一段代码，编译前** | `specmate_check` | check_style (正则) | 写完代码立刻 lint。19 条正则规则（11 always-on + 8 full-scan），秒出结果，容错强（语法残缺也能跑）。可选 `compile=true` 串联 BSC 编译。 |
| **写完一段代码，编译前 + 要跑 BSC** | `specmate_check(compile=true)` | check_style + BSC runner + diagnose | 先 lint 再编译，编译输出自动喂给 diagnose 诊断。编译失败时自动尝试 P0200 自动修复（BVI schedule 展开）。 |
| **编译通过，但有调度疑问** | `specmate_analyze` | ast_query (tree-sitter) | 编译过了但不确定 rule 之间的调度关系是否正确、方法调用顺序是否合理、是否存在隐式冲突。ast_query 做深度分析：调用图、依赖图、冲突对检测。 |

**三者关系**：

```
specmate_scan (编码前)     → preflight.mjs     — 轻量 AST 扫描，快速暴露已知陷阱
specmate_check (编码后)    → check_style.mjs   — 正则 lint，快速+容错
specmate_check(compile=true)→ +BSC runner       — 编译+诊断全流程
specmate_analyze (深度分析) → ast_query.mjs     — tree-sitter 深度分析调度/依赖
```

> 三条路线互不调用、各有分工。check_style 不依赖 tree-sitter，ast_query 不做快速 lint。这是有意的架构分离，不是缺陷。

---

## 方向四：知识积累闭环 📈

> **哪怕我们不更新了，只要有人在用、在 diagnose、在 resolve，specmate 就一直长。**

| 环节 | 触发 | 存储 | 统计 |
|------|------|------|------|
| **Capture**（捕获） | check_style 命中 / diagnose / capture 工具 | `captures` 表（dedup: 同 session 同文件同 code → repeat_count+1） | 编译失败次数、顽固错误 |
| **Diagnose**（诊断） | bsc 编译输出 → parseBSCDiagnostics() | 查 errors 表找已知方案，查 similarity 找相似未知码 | 历史累计次数 |
| **Resolve**（固化） | Agent 手动调 resolve 工具 | `captures.status = 'resolved'`，记录 cause + solution | 修复率 |
| **下次命中** | 同一 code 再次出现 → diagnose 直接返回已知方案 | — | count 自动累积 |
| **知识增长** | 未知错误 → Agent LLM 分析 → resolve 入库 → errors 表 +1 篇 | errors 表 | 29→30→31... |
| **自动聚类** | `queryClusteredCaptures()` → 审查 → 生成新知识条目 | 跨 session 聚类 | minRepeat=3, minSession=2 |

**闭环示意**：
```
编译报错 ──→ capture(入库, repeat+1) ──→ diagnose(查知识库, 匹配已知方案)
   ↑                                                          ↓
   │                                                    有已知方案？
   │                                                    ├─ 是 → fix + resolve
   │                                                    └─ 否 → LLM 分析 → resolve(→ 知识库 +1)
   │                                                                              ↓
   └──────────────────── 下次同样错误直接命中 ←─────────────────────────────────┘
```

---

## 方向五：编译集成 & 主动询问 🏗️

> Q3 新增能力，将 BSC 编译器引入 MCP 工具链。

### 5a：BSC 编译集成

| 模块 | 文件 | 状态 | 说明 |
|------|------|:---:|------|
| **BSC 检测** | `src/compile/bsc-detector.mjs` | 🟢 Q3 新增 | 三级检测：`which bsc` → Docker → 不可用 |
| **BSC 运行** | `src/compile/bsc-runner.mjs` | 🟢 Q3 新增 | `child_process.spawn`，120s 超时，输出截断 |
| **编译缓存** | `globalThis.__specmateCompileCache` | 🟢 Q3 新增 | 同 session 同文件未变化→跳过编译 |
| **compile→diagnose 管道** | server.mjs `specmate_check(compile=true)` | 🟢 Q3 新增 | 编译输出自动喂给 diagnose |

### 5b：MCP Elicitation（主动询问）

| 模块 | 文件 | 状态 | 说明 |
|------|------|:---:|------|
| **阶段推断** | `src/elicitation/elicit-phase.mjs` | 🟢 Q3 新增 | 关键词推断 design/code/debug |
| **Elicitation 触发** | `resolvePhase()` | 🟢 Q3 新增 | 绑定 SPECMATE_LEVEL，`tapeout` 模式下主动问 |
| **阶段持久化** | sessions.phase | 🟢 Q3 新增 | 缓存到 DB 避免重复推断 |

---

## 方向六：推送 & 通知 📡

> 主动推送陷阱和告警给 Agent，避免 Agent "不知道有这个 mate"。

| 模块 | 文件 | 状态 | 说明 |
|------|------|:---:|------|
| **告警系统** | `src/push/alerts.mjs` | 🟢 活跃 | 重构后移除 WebSocket，改为 MCP notification |
| **通知桥接** | `src/notify.mjs` | 🟢 活跃 | MCP 协议的 notification 通道 |
| **知识图谱** | `src/tools/_matcher.mjs` | 🟢 活跃 | 30 个节点，关键词→陷阱匹配 |
| **代码范式** | `src/tools/_patterns.mjs` | 🟢 活跃 | 15 个 BSV 代码骨架模板 |
| **相似度匹配** | `src/tools/_similarity.mjs` | 🟢 Q3 新增 | Jaccard + 前缀匹配，未知错误找相似已知 |
| **源码上下文** | `src/tools/_context.mjs` | 🟢 Q3 新增 | tree-sitter 提取错误行 ±10 行上下文 |

**推送触发时机**：
- `specmate_scan` → pre_code 陷阱推送
- `specmate_check` → 静态检查问题推送
- `specmate_analyze` → 调度冲突告警
- `specmate_capture` → 新错误捕获通知
- `specmate_resolve` → 修复率告警
- `specmate_diff` → warning 变化告警

---

## 全局架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MCP Client (Agent)                         │
│                     stdio / HTTP :9339/mcp                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │       bin/server.mjs           │
                    │   8 MCP tools registered       │
                    │   + notification bridge        │
                    └───────────────┬───────────────┘
                                    │
        ┌───────────┬───────────────┼───────────────┬───────────┐
        ▼           ▼               ▼               ▼           ▼
   ┌─────────┐ ┌─────────┐   ┌───────────┐   ┌─────────┐ ┌─────────┐
   │ 知识引擎 │ │ 静态检查 │   │ BSC集成    │   │ AST分析  │ │ 推送系统 │
   │         │ │         │   │           │   │         │ │         │
   │ schema  │ │check_st │   │detector   │   │ast_query│ │ alerts  │
   │ query   │ │ yle(19条)│  │runner     │   │ .mjs    │ │ .mjs    │
   │ parser  │ │preflight│   │(compile=  │   │         │ │ notify  │
   │ seed    │ │ (6条)   │   │ true集成) │   │         │ │         │
   │         │ │         │   │           │   │         │ │         │
   │ SQLite  │ │  正则   │   │ child_    │   │tree-sit │ │ MCP     │
   │ ~/.spec │ │ +tree-  │   │ process   │   │ er+BSV  │ │ notif   │
   │ mate/   │ │ sitter  │   │           │   │         │ │         │
   └────┬────┘ └─────────┘   └───────────┘   └─────────┘ └─────────┘
        │
        ▼
   ┌─────────────────────────────────────┐
   │         知识积累闭环                 │
   │  capture → diagnose → resolve       │
   │  auto-count → cross-session stats   │
   │  similarity → context → LLM分析     │
   └─────────────────────────────────────┘
```

---

## 状态图例

| 标记 | 含义 |
|:----:|------|
| 🟢 活跃 | 在 MCP 工具链中正常运行，每次 Agent 调用都走这条路径 |
| 🟡 仅 CLI | 保留但不在 MCP 工具链中，仅供开发调试 |
| 🔴 已弃用 | 已从 MCP 注册表移除，代码作为空壳保留以防引用报错 |
| 🆕 Q3/Q4 | 2026-07-17 新增，活跃使用中 |
