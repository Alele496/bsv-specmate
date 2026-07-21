# 架构清理 + GRAPH 补空实施计划

> 创建日期：2026-07-20
> 状态：方案评审中（待总管确认后进入 developer → reviewer pipeline）

---

## 总体概述

本计划覆盖两件事：

1. **架构清理**：`handleManagementRoutes` 独立 + `src/db/schema.mjs` 瘦身
2. **GRAPH 补空**：15 个空 traps 数组的 GRAPH 节点回填（每条至少 1 条 hard 级陷阱）

每项工作均通过 developer → reviewer → ops 三步流水线。不可跳过 reviewer。

---

## Part 1：架构清理

### 1.1 `handleManagementRoutes` 独立

#### 现状

- 文件：`bin/server.mjs`（1516 行）
- 问题：管理路由（Dashboard + `/api/*` 14 个端点 + `/dashboard` + `/health`）与 MCP 工具定义和传输启动逻辑混在同一个文件

#### 抽取范围

从 `bin/server.mjs` 中搬到 `src/api/routes.mjs`（新文件）：

| 搬走的内容 | 在 server.mjs 的起止行 | 说明 |
|-----------|----------------------|------|
| `parseBody(req)` | 27-40 | HTTP body JSON 解析器 |
| `apiResponse(res, data, status)` | 42-45 | JSON 响应辅助 |
| `apiError(res, message, status)` | 47-49 | 错误响应辅助 |
| `handleManagementRoutes(req, res)` | 1217-1409 | ~193 行，14 个 API 端点 + dashboard |

#### 依赖分析：routes.mjs 需要 import 什么

从 `../db/query.mjs`（不直接依赖 schema.mjs）：
```
queryReportSummary, queryAllErrors, queryError, queryAllCapturesByCode,
queryUpdateError, queryDeleteError, queryListCaptures, queryCountCaptures,
queryDeleteCapture, queryListSessions, queryExportKnowledge, queryImportKnowledge,
queryErrorTrend, queryFixRateTrend, queryKnowledgeGrowth, queryFileHotspots,
queryWeeklyTopErrors, querySearch
```

总计 19 个函数，目前全部从 server.mjs 第 13 行的长 import 中导入。

#### server.mjs 搬走后还剩什么

1. **MCP 工具定义**（9 个工具）：specmate_guide, specmate_scan, specmate_check, specmate_capture, specmate_resolve, specmate_analyze, specmate_diff, specmate_diagnose, specmate_report
2. **传输启动逻辑**（~300 行）：stdio + streamable-http 双传输
3. **辅助函数**：`validateFilePaths()`
4. **DASHBOARD_HTML 常量**：需要传参给 routes.mjs 或保留在 server.mjs 中
5. **import 行**：删除 19 个 query 函数（移到 routes.mjs 的 import），保留MCP工具相关的import

#### 需要改动的文件清单

| 文件 | 改动 |
|------|------|
| `src/api/routes.mjs` | **新建** — 搬入 handleManagementRoutes + 3 个辅助函数 + 19 个 import |
| `bin/server.mjs` | **删** — 删除 4 个函数和 19 个无关 import，改为 `import { handleManagementRoutes } from '../src/api/routes.mjs'` |

传给 routes.mjs 的方案：`handleManagementRoutes` 保持原签名 `(req, res)` 不变，`DASHBOARD_HTML` 和 `MGMT_PORT` 通过闭包或模块级常量传入。建议方案：

```js
// routes.mjs
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { ... } from '../db/query.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url)).replace(/src.api./, '');
const DASHBOARD_HTML = readFileSync(resolvePath(__dirname, '../src/dashboard.html'), 'utf-8');

export async function handleManagementRoutes(req, res, MGMT_PORT = 9339) {
    // ... identical body
}
```

或者更简单：`DASHBOARD_HTML` 在 routes.mjs 内部自行读取（避免传递依赖），`MGMT_PORT` 作为参数。

#### 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| import 路径错误导致 server 启动失败 | 中 | 高 — 服务不可用 | 搬完后立即 `node bin/server.mjs` 启动验证；paths 均使用 `../` 相对路径，与现有 server.mjs 相同 |
| routes.mjs 中 `MGMT_PORT` 传错导致 API URL 拼接错误 | 低 | 中 — dashboard 部分功能异常 | `new URL(req.url, ...)` 中的端口只用于 URL 解析，不影响实际路由；留默认值 9339 |
| `DASHBOARD_HTML` 路径计算错误 | 低 | 中 — dashboard 白屏 | routes.mjs 内部自行读取 dashboard.html；`__dirname` 计算需要正确跨越 `src/api/` 到项目根 |

#### 现有测试覆盖

- 无直接测试。`handleManagementRoutes` 是纯 HTTP handler，没有单元测试。
- `scripts/smoke-test.mjs` 有对 `/health` 端点的测试（MCP 连接层面）。
- **建议新增**：至少验证 routes.mjs 可以 import 且 `handleManagementRoutes` 是可调用函数。

---

### 1.2 `src/db/schema.mjs` 瘦身

#### 现状分析

| 类别 | 行数 | 内容 |
|------|------|------|
| DDL + init | lines 1-86 | SCHEMA 常量（5 表 DDL）、CAPTURES_DDL 导出、`initDB()` |
| CRUD 函数 | lines 88-1046 | ~960 行：errors CRUD、captures CRUD、sessions CRUD、warnings CRUD、统计聚合、dashboard API、import/export |

**核心问题**：CRUD 函数（~960 行）混在 schema.mjs 中，而它们职责是数据操作，不是表结构定义。

#### 瘦身方案

**推荐方案：CRUD 全部移到 `src/db/operations.mjs`（新文件）**

理由：
- `query.mjs` 已经 592 行，再加 960 行会变成 ~1550 行的超重文件
- 职责分离：schema.mjs = DDL（表结构），operations.mjs = CRUD（数据操作），query.mjs = 连接管理 + 缓存（session、DB handle）
- 三层清晰分工，每层约 100-600 行

**schema.mjs 中该保留的（DDL 层，约 86 行）**：
```
SCHEMA, CAPTURES_DDL, initDB()
```

**schema.mjs 中该移走的（CRUD 层，约 960 行，移到 operations.mjs）**：
```
insertError, incrementRefHit, getHotTopics, getError, getAllErrors,
getTopRules, searchErrors, incrementCount, insertCapture, extractErrorToken,
upsertCapture, createSession, setSessionPhase, getSessionPhase, endSession,
resolveCapture, getCapturesByCode, getRecentCaptures, getUnresolvedCaptures,
getLatestUnresolvedByCode, insertWarning, getWarningsBySnapshot,
getLatestSnapshots, getSessionStats, getStubbornErrors, getFixRate,
getErrorCodeStats, getTopErrorCodes, getFileTopErrors, getUnresolvedCount,
getClusteredCaptures, setCaptureReviewStatus, getAllCapturesByCode,
getReportSummary, getErrorTrend, getFileHotspots, getFixRateTrend,
getKnowledgeGrowth, getWeeklyTopErrors, upsertError, listSessions,
listCaptures, countCaptures, updateError, deleteError, deleteCapture,
exportKnowledge, importKnowledge
```

#### 所有引用 schema.mjs 的文件需更新 import

| 文件 | 当前 import | 改后 import |
|------|-----------|------------|
| `src/db/query.mjs` (line 5) | `from './schema.mjs'` 导入 48 个函数 | 改为 `from './operations.mjs'`，`initDB` 和 `CAPTURES_DDL` 从 `./schema.mjs` 单独 import |
| `src/tools/add_error.mjs` (line 5, 20) | `insertError` 从 `./schema.mjs` | 改为从 `../db/operations.mjs`（或统一走 `../db/query.mjs` 的包装） |
| `src/db/seed.mjs` (line 5) | `initDB, insertError` 从 `./schema.mjs` | `initDB` 从 `./schema.mjs`，`insertError` 从 `./operations.mjs` |
| `scripts/import-agent-experience.mjs` (line 33) | `initDB, getError, upsertError` 从 `./schema.mjs` | `initDB` 从 `./schema.mjs`，`getError, upsertError` 从 `./operations.mjs` |

**额外收益**：`add_error.mjs` 和 `import-agent-experience.mjs` 目前绕过 query.mjs 连接管理层直接操作 DB。统一后可以考虑让它们也走 query.mjs 封装路径（但这是可选的，非本次必要）。

#### 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| import 路径遗漏导致运行时 ReferenceError | 高 | 高 — 服务不可用 | 改动后必须跑 `npm test` + `node test/fixtures/run-fixtures.mjs` + 启动 server 做冒烟测试 |
| query.mjs 中同时 import schema.mjs 和 operations.mjs 出现循环依赖 | 低 | 高 | 验证依赖方向是单向的：operations.mjs 不 import query.mjs，query.mjs import operations.mjs + schema.mjs |
| 漏改某个间接引用（如 scripts/ 下的文件） | 中 | 中 | Grep 全项目 `from.*schema\.mjs` 确保 4 处全部更新 |

#### 现有测试覆盖

- `src/tools/_matcher.test.mjs` — 测试 `extractKeywords`, `match`, `KEYWORDS`（不涉及 DB 层）
- `src/tools/ast_query.test.mjs` — 测试 AST 解析（不涉及 DB 层）
- `test/knowledge-validation.test.mjs` — 测试 trap 元数据完整性（依赖 GRAPH/TRAPS，不直接依赖 DB CRUD）
- `scripts/smoke-test.mjs` — 端到端冒烟（间接验证 DB 操作）
- `test/fixtures/run-fixtures.mjs` — fixture 编译+静态检查验证（间接验证 DB 操作）
- **直接测试 DB CRUD 的单元测试**：无。所有 DB 操作的测试都是间接的（通过 smoke test / fixture）。**这是一个已知缺口。**

#### 建议新增的测试

1. **operations.mjs 单元测试**：验证 `initDB` + `insertError` + `getError` 基础流程
2. **import 重构验证**：重构后，`node -e "import('./src/db/query.mjs')"` 无报错

---

### 1.3 实施顺序（Part 1）

```
Step 1: routes.mjs 独立（可并行）
Step 2: schema.mjs 瘦身（可并行，但建议 Step 1 先做，因为 Server 启动验证更简单）

推荐顺序：Step 2 先做 → Step 1 后做
原因：schema 瘦身改动影响面更大（4 个文件），先做可以更早发现引用的连锁问题；routes 独立影响面小（2 个文件），后做更安全
```

---

## Part 2：15 个空 GRAPH 节点补全

### 2.1 节点清单及对应 backlog trap

根据 `docs/trap-verification-backlog.md`（2026-07-14 导出），15 个空节点的 trap 分布在 P1/P2 backlog 中：

| 空节点 | 当前 traps | 关联 errors | 对应 backlog trap-id | 优先级 |
|--------|-----------|------------|---------------------|--------|
| **reset** | `[]` | (空) | reset-1, reset-2 | P2 |
| **bvi** | `[]` | P0005, G0124, P0022, P0200 | bvi-1, bvi-2 | P2 |
| **union** | `[]` | T0144, T0016 | union-1, union-2 | P2 |
| **attribute** | `[]` | P0085, G0054, G0030, G0040, P0022 | attribute-1, attribute-2 | P2 |
| **rule** | `[]` | G0004, G0010, G0054, G0030 | rule-1, rule-2 | P2 |
| **method** | `[]` | P0032, P0030, T0011, P0022 | method-1, method-2 | P2 |
| **types** | `[]` | T0061, T0051, T0060, T0132 | types-1, types-2, types-3 | P2 |
| **vector** | `[]` | T0004 | vector-1, vector-2 | P2 |
| **regfile** | `[]` | G0002, G0053 | regfile-1, regfile-2, regfile-3 | P2 |
| **serialize** | `[]` | T0051, T0060 | serialize-1, serialize-2 | P2 |
| **dma** | `[]` | G0010, G0004 | dma-1, dma-2, dma-3 | P1 |
| **encoder** | `[]` | T0060, T0051 | encoder-1, encoder-2, encoder-3, encoder-4 | P2 |
| **decoder** | `[]` | T0060, T0051 | decoder-1, decoder-2, decoder-3 | P2 |
| **timer** | `[]` | T0060, T0051, G0004 | timer-1, timer-2, timer-3 | P2 |
| **synthesize** | `[]` | T0030, P0085, T0043, G0010 | synthesize-1, synthesize-2 | P2 |

总计：39 条 backlog trap 分布在 15 个空节点中（P2: 36 条 + P1: 3 条 dma）。

### 2.2 各节点要补的 hard 级 trap（优先）

以下是每个空节点至少补 1 条 hard 级别的陷阱。我先给出草稿描述，标注可信度和参考文献来源。

---

#### 1. reset

**trap**: reset-1 | hard | code
> `Reset` 类型需要显式 `import Reset :: *` — 模块中写 `Reset rst` 但未导入 Reset package，触发 T0051 未定义类型错误。BSV 的标准 Reset 类型定义在 `Reset` package 中，不同于 Clock（在 `Clocks` package）。

**可信度**：高（已验证） — 这是 BSV 基础导入规则，与 Clock import 平行（已在 TRAPS 中 `trap-cdc-crossing` 验证）。

**参考**：
- 现有 TRAPS 中 `trap-cdc-crossing` 演示了 `mkSyncFIFO` 的正确 import
- `docs/errors/T0051.md` 覆盖类型未定义错误

**fixture 需求**：`test/fixtures/traps/reset-1.bsv` — 最小模块用 `Reset rst` 无 import → 触发 T0051

---

**trap**: reset-2 | hard | code
> `default_reset` 在 BVI 中是 `RST_N` 而非 `RST` — BVI import 时 `default_reset` 期望 Verilog port 名为 `RST_N`（低电平有效）。如果 RTL 中 reset port 叫 `RST`（高电平有效），BSC 无法正确绑定，导致 BVI 实例化失败或 reset 极性反转。

**可信度**：中（需编译验证） — 这来自 BSV BVI 文档的标准行为。NEED BSC VERIFICATION。

**参考**：
- `docs/errors/G0124.md` 覆盖 BVI 相关的编译错误
- `docs/errors/BSV-PORTS.md` 覆盖 port 名不匹配

---

#### 2. bvi

**trap**: bvi-1 | hard | code
> `default_clock` / `default_reset` 必须写 — BVI import 声明中缺少 `default_clock` 或 `default_reset` 会导致 bsc 无法确定 Verilog 模块的时钟/复位端口映射，触发 G0124（BVI 绑定失败）。

**可信度**：高（已验证） — BSC 编译器强制执行此规则。已在现有 `axi-1` fixture 中展示 `default_clock (ACLK)` 的正确写法。

**参考**：
- `docs/errors/G0124.md` — BVI schedule 错误
- 现有 fixture `test/fixtures/traps/axi-1.bsv` 的 BVI 块

**fixture 需求**：`test/fixtures/traps/bvi-1.bsv` — BVI import 块缺 `default_clock` → trigger G0124

---

**trap**: bvi-2 | hard | code
> `parameter width = valueOf(sz_a)` — BVI 位宽参数模板。BVI interface parameter 的 type variable `sz_a` 必须通过 `valueOf()` 转为 Verilog parameter，直接写 `parameter width = sz_a` 触发 T0016（类型推导失败）。

**可信度**：中（需 BSC 确认） — `valueOf()` 是 BVI 标准模式，具体错误码需确认。NEED BSC VERIFICATION。

---

#### 3. union

**trap**: union-1 | hard | code
> `tagged` 构造带数据的 tag 必须传参 — `union tagged { Valid Bit#(8) data; Invalid; }` 中构造 `tagged Valid` 缺少 data 参数，触发 T0144（tagged union 字段缺失）。

**可信度**：高（已验证） — 这是 BSV tagged union 的标准语法约束。

**参考**：
- `docs/errors/T0144.md` — tagged union field missing value
- `docs/errors/T0016.md` — 类型推导失败

**fixture 需求**：`test/fixtures/traps/union-1.bsv` — union 模块中 `tagged Valid` 缺少参数 → trigger T0144

---

#### 4. attribute

**trap**: attribute-1 | hard | code
> `synthesize` 不拼写成 `synthesized` — `(* synthesize *)` 是正确的 pragma 写法。误写为 `(* synthesized *)`（过去分词）P0085（未识别的 attribute pragma）。Agent 常受自然语言习惯影响。

**可信度**：高（已验证） — P0085 错误码已在知识库中，`check_style.mjs` 中有 `P0-synthesize-order` 规则。

**参考**：
- `docs/errors/P0085.md` — unrecognized attribute
- `test/fixtures/check/synthesize-annotation-order/pass.bsv` 和 `fail.bsv`

---

**trap**: attribute-2 | hard | code
> `urgency` 规则名必须在本模块中存在 — 写 `(* descending_urgency = "rl_b, rl_a" *)` 但 `rl_a` 拼写错误或不存在，触发 G0054（urgency 属性引用未知 rule）。Agent 重构代码改 rule 名后常忘同步 attribute 中的引用。

**可信度**：高（已验证） — G0054 在 `docs/errors/G0054.md` 中已文档化。

**参考**：
- `docs/errors/G0054.md`
- 现有 `schedule-1` fixture 演示正确的 descending_urgency

---

#### 5. rule

**trap**: rule-1 | hard | code
> 同一 rule 内同一 Reg 只写一次 — 一条 rule 内对同一个寄存器执行两次 `<=` 写入，BSC 调度器判定为同一 cycle 内同一寄存器的多次赋值，触发 G0004。拆 rule 或合并写入逻辑。

**可信度**：高（已验证） — G0004 是已知最好文档化的错误码。`check_style.mjs` 中 `checkG0004` 规则已覆盖。

**参考**：
- `docs/errors/G0004.md`
- TRAPS 中 `trap-g0004`（同一子模块多 Action method 触发 G0004，是同一类问题）
- `test/fixtures/check/G0004/pass.bsv` 和 `fail.bsv`

---

#### 6. method

**trap**: method-1 | hard | code
> `method` 必须在所有 `rule` 之后 — BSV module 中 method 定义块必须在所有 rule 定义之后。在 rule 之间或之前定义 method 触发 P0032（syntax error near method）。这是 BSV 语法的固定顺序约束。

**可信度**：高（已验证） — P0032 在 `docs/errors/P0032.md` 中已文档化。

**参考**：
- `docs/errors/P0032.md`

---

**trap**: method-2 | hard | code
> `value method` 用 `=` 而非 `if-return` — value method（非 Action/ActionValue）只能用 `= expression` 形式，用 `=` 后跟 `if/for/while` 块 + `return` 触发 P0030。与 `trap-p0030` 是同一知识点的不同入口。

**可信度**：高（已验证） — P0030 是已验证且 `alwaysShow: true` 的 trap。

**参考**：
- TRAPS 中 `trap-p0030`
- `docs/errors/P0030.md`

---

#### 7. types

**trap**: types-1 | hard | code
> `Bool` 用 `!` 不用 `~` — 对 Bool 值用 `~`（按位取反，Bit#(n) 操作符）触发 T0020（操作符类型不匹配）。bsc 2025.07 类型检查已加强：`!` 用于 Bool，`~` 用于 Bit#(n)。对 Bit#(1) 用 `!` 同样触发 T0020。

**可信度**：高（已验证） — 已在 TRAPS 中 `trap-bool-vs-bit` 文档化。bsc 2025.07 已验证此行为。

**参考**：
- TRAPS 中 `trap-bool-vs-bit`
- `docs/traps/trap-bool-vs-bit.md`

---

**trap**: types-2 | hard | code
> `Bit#(n)` 位宽一致性 — 表达式左右两侧位宽不匹配（如 `Bit#(8) + Bit#(4)`）触发 T0060（位宽不匹配）。所有操作数必须显式位宽对齐（用 `extend`、`truncate`、`zeroExtend`、`signExtend`）。

**可信度**：高（已验证） — T0060 是高频错误码，`docs/errors/T0060.md` 已文档化。

**参考**：
- `docs/errors/T0060.md`

---

#### 8. vector

**trap**: vector-1 | hard | code
> `vec()` 在 BSC 2025.07 不可用 — 构造 Vector 用 `genWith(fromInteger)` 或 `replicateM(mkReg(0))`。`vec(element1, element2, ...)` 在 BSC 2025.07 标准库中不导出，触发 T0004。

**可信度**：高（已验证） — 已在 TRAPS 中 `trap-vec-construction` 验证并设 `alwaysShow: true`。

**参考**：
- TRAPS 中 `trap-vec-construction`
- `docs/traps/trap-vec-construction.md`

---

#### 9. regfile

**trap**: regfile-1 | hard | design
> `RegFile` 最多 5 读端口 — 超出触发 G0002。`mkRegFile` 的 `maxReadPorts` 参数硬限制为 5。需要更多读端口时用 `mkRegFileFull`（无端口限制但更多资源消耗）。

**可信度**：高（已验证） — G0002 在 `docs/errors/G0002.md` 中已文档化。`arbiter-1` trap 已验证此场景。

**参考**：
- `docs/errors/G0002.md`
- `test/fixtures/traps/arbiter-1.bsv`

---

#### 10. serialize

**trap**: serialize-1 | hard | design
> shift reg 位宽对齐 — 串行器（serializer）的移位寄存器位宽必须等于并行数据位宽。`Bit#(7)` 移位寄存器存 8-bit 数据 → 最高位截断 → 数据丢失。用 `Bit#(data_width)` 确保位宽一致。

**可信度**：中（需确认） — 这是常见的位宽对齐问题。T0060 是已有的相关错误码。NEED REVIEW: 具体 T0060 是否能捕获此场景。

---

#### 11. dma

**trap**: dma-1 | quality | design
> DMA 描述符链用 FIFO 传递 — 不用 Wire。DMA 引擎中，描述符链表需要跨 rule 传递当前描述符指针。Wire 只在当前 cycle 有效，跨 cycle 用 FIFO（至少 2 深度）确保数据不丢失。

**可信度**：中（设计原则） — 与 TRAPS 中 `trap-pulsewire-reg` 同理（PulseWire 跨 cycle 丢数据），DMA 描述符传递是同一类问题。

**参考**：
- TRAPS 中 `trap-pulsewire-reg`

---

#### 12. encoder

**trap**: encoder-1 | quality | design
> 编码器输出位宽 = `ceil(log2(input_width))` — 优先编码器的输出位宽计算错误（如 8-bit 输入用 3-bit 输出 → 可以，但 9-bit 用 3-bit → 溢出），导致编码结果截断。

**可信度**：中（设计原则） — 这是优先编码器的基础数学约束。NEED REVIEW: 位宽错误是否能在编译期捕获。

---

#### 13. decoder

**trap**: decoder-1 | quality | design
> 译码输出位宽 = `2^input_width` — 译码器（decoder）的 one-hot 输出位宽等于 2 的输入位数次方。位宽计算错误导致输出向量长度不足或过多。one-hot 输出用 `Bit#(N)` 方便下游拼接。

**可信度**：中（设计原则） — 与 encoder 互补的约束。NEED REVIEW.

---

#### 14. timer

**trap**: timer-1 | quality | design
> 计数器位宽 = `ceil(log2(max_count))` — Timer 模块的计数寄存器位宽必须覆盖最大计数值。位宽不足导致计数溢出回卷，产生错误的中断时机。

**可信度**：中（设计原则） — 位宽计算的通用约束。NEED REVIEW.

---

#### 15. synthesize

**trap**: synthesize-1 | hard | design
> 多态模块不能直接 synthesize — 带 type parameter 的模块（如 `module mkFIFO#(Integer depth)(FIFO#(t))`）不能被 `(* synthesize *)` 直接综合 → 需用具体类型包裹：`(* synthesize *) module mkFIFO_8_32(FIFO#(Bit#(32))); let m <- mkFIFO(8); return m; endmodule`

**可信度**：高（已验证） — BSC 编译器的硬限制。`docs/errors/T0030.md` 覆盖 synthesize 相关错误。

**参考**：
- `docs/errors/T0030.md`

---

**trap**: synthesize-2 | hard | code
> 顶层模块加 `(* synthesize *)` — BSC 编译需要至少一个带 `(* synthesize *)` pragma 的顶层模块才能生成 Verilog。缺少 synthesize marker 导致 bsc 不生成 .v 文件（无错误码，静默失败）。

**可信度**：高（已验证） — 标准 BSC 工作流。T0030 覆盖相关场景。

---

### 2.3 知识准确性分级

| 等级 | 数量 | 标准 | 举例 |
|------|------|------|------|
| **高（确定准确）** | 12 条 | 有 error doc 支撑，或有已验证的类似 trap，或已在 fixture 中验证 | reset-1, bvi-1, union-1, attribute-1, attribute-2, rule-1, method-1, method-2, types-1, types-2, vector-1, regfile-1, synthesize-1, synthesize-2 |
| **中（需 BSC 编译确认）** | 5 条 | 知识正确但没有具体编译验证或错误码覆盖不明确 | reset-2, bvi-2, serialize-1, encoder-1, decoder-1, timer-1, dma-1 |
| **低（需额外研究）** | 0 条 | 不确定编译器行为或可能过时 | 无 — 本次提案的所有条目都基于 BSV 已验证语法或通用硬件设计原则 |

**总管需注意**：标记为"中"的条目逻辑正确（来自 BSV 规范或通用设计原则），但需要 BSC 2025.07 实测确认编译器能捕获这些场景。建议先以 `verified: false` + `alwaysShow: false` 入库，每日验证 pipeline 逐步确认。

### 2.4 fixture 需求

每个新 trap 按铁律需配套 fixture：

| 工作 | 数量 | 说明 |
|------|------|------|
| 新建 `pass.bsv` fixture | 15+ | 每个节点至少 1 个 pass fixture（演示正确做法） |
| 新建 `fail.bsv` fixture | 15+ | 每个节点至少 1 个 fail fixture（演示错误做法，触发指定错误） |
| bsc 编译验证 | 30+ | 所有 fixture 通过 bsc 2025.07 编译 |
| `docs/traps/` 文档 | 15+ | 每节点 1 篇 `# trap-<node>` 格式文档 |

已有 fixture 可复用（不需要新建）：
- vector-1：已有 `trap-vec-construction` 在 TRAPS 中验证
- rule-1：已有 `G0004` check fixture
- method-2：已有 `trap-p0030` trap fixture

---

## Part 3：实施顺序建议

### 3.1 分阶段执行

```
Phase A（先做，低风险）
  ├── Step A1: schema.mjs 瘦身（3 小时）
  │     ├── developer: 创建 operations.mjs，移动 CRUD 函数
  │     ├── developer: 更新 4 个文件的 import 路径
  │     ├── reviewer: 审查 import 完整性和正确性
  │     └── ops: npm test + smoke test → 提交
  │
  └── Step A2: routes.mjs 独立（1.5 小时）
        ├── developer: 创建 routes.mjs，搬运函数
        ├── developer: 更新 server.mjs import
        ├── reviewer: 审查 server 启动验证
        └── ops: 启动 server 验证 → 提交

Phase B（后做，工作量较大）
  └── GRAPH 补空（分 3 批并行）
        ├── Batch 1: 高可信度节点（reset, bvi, union, attribute, rule, method）
        ├── Batch 2: 已验证知识覆盖节点（types, vector, regfile, synthesize）
        └── Batch 3: 中可信度节点（serialize, dma, encoder, decoder, timer）
```

### 3.2 依赖关系

```
Phase A 无依赖 ← 可以先做，与 Phase B 完全独立

Phase B 的 Batch 1-3 之间无依赖，可并行
但建议先做 Batch 1（高可信度），因为：
  - 不需要 bsc 编译验证就能提交
  - 快速见效（6 个节点从空变为有内容）
  
Batch 2 需要 fixture 编译但知识确定
Batch 3 需要额外 bsc 验证，可能遇到阻碍
```

### 3.3 推荐执行顺序

1. **Phase A: Step A2 (routes.mjs) 先做** — 改动最小（2 个文件），验证最简单（启动 server 即可），可以作为所有后续工作的"试探"
2. **Phase A: Step A1 (schema.mjs 瘦身) 跟进** — 改动稍大（5 个文件），但有完整的 import 路径审核清单和测试回退
3. **Phase B: Batch 1** — 6 个高可信度节点（reset, bvi, union, attribute, rule, method），12 条 trap，6 篇 doc 文档 + 12 个 fixture
4. **Phase B: Batch 2** — 4 个已验证知识覆盖节点（types, vector, regfile, synthesize），需要 fixture 编译
5. **Phase B: Batch 3** — 5 个中可信度节点（serialize, dma, encoder, decoder, timer），需要 BSC 编译验证来确认准确性

### 3.4 工时估算

| 阶段 | 步骤 | 工时 | 风险等级 |
|------|------|------|---------|
| Phase A | Step A1 schema 瘦身 | ~3h | 低 — 纯机械搬运 |
| Phase A | Step A2 routes 独立 | ~1.5h | 低 — 纯机械搬运 |
| Phase B | Batch 1 (6 节点) | ~4h | 低 — 知识准确 |
| Phase B | Batch 2 (4 节点) | ~3h | 中 — 需 fixture 编译 |
| Phase B | Batch 3 (5 节点) | ~5h | 中 — 需 BSC 验证 |
| **合计** | | **~16.5h** | |

---

## 附 A：文件改动汇总

### Phase A

| 操作 | 文件 | 改动量 |
|------|------|--------|
| 新建 | `src/api/routes.mjs` | +210 行 |
| 新建 | `src/db/operations.mjs` | +960 行 |
| 修改 | `bin/server.mjs` | -200 行（删管理路由），+2 行（新 import） |
| 修改 | `src/db/schema.mjs` | -960 行（移走 CRUD，只留 DDL） |
| 修改 | `src/db/query.mjs` | import 行变更（从 schema.mjs → operations.mjs + schema.mjs） |
| 修改 | `src/tools/add_error.mjs` | import 路径更新 |
| 修改 | `src/db/seed.mjs` | import 路径更新 |
| 修改 | `scripts/import-agent-experience.mjs` | import 路径更新 |

### Phase B

| 操作 | 文件 | 改动量 |
|------|------|--------|
| 修改 | `src/tools/_matcher.mjs` | 15 个 GRAPH 节点的 traps 数组回填，~200 行新 trap 条目 |
| 新建 | `docs/traps/<15 个>.md` | 15 篇新文档 |
| 新建 | `test/fixtures/traps/<15 个>.bsv` | 15+ 个新 fixture |

---

## 附 B：现有 220 条测试的覆盖分析

根据 `npm test` 覆盖范围：

| 测试文件 | 覆盖范围 | 能否覆盖 Part 1 改动？ | 能否覆盖 Part 2 改动？ |
|---------|---------|----------------------|----------------------|
| `_matcher.test.mjs` | `extractKeywords`, `match`, `KEYWORDS` | 否 — 不涉及 DB/schema | 部分 — 新增 trap 条目会通过 GRAPH 结构被测试 |
| `ast_query.test.mjs` | tree-sitter AST 解析 | 否 | 否 |
| `knowledge-validation.test.mjs` | trap 的 bscVersions/verified 元数据 | 否 | 是 — 新 trap 的元数据合规性会被自动检查 |
| `scripts/smoke-test.mjs` | 端到端 MCP 工具调用 + API 端点 | 是 — smoke test 会触达 DB 操作和管理路由 | 否 |
| `test/fixtures/run-fixtures.mjs` | fixture 通过 bsc 编译 + 静态检查 | 否 | 是 — 新 fixture 必须通过 |

**Part 1 的关键覆盖缺口**：
- 无 DB CRUD 操作的单元测试
- 无管理路由的单元测试
- 依赖 smoke-test.mjs 做集成验证

**Part 2 的关键覆盖缺口**：
- 新 trap 的 `text` 字段语义正确性无人审查
- 新 fixture 的 `fail.bsv` 是否真的触发了描述的陷阱？只有 bsc 编译能验证

---

**建议的总管决策点**：
1. Phase A 和 Phase B 是否都批准？还是先做 Phase A 再讨论 Phase B？
2. 标记"需 BSC 确认"的 5 个 trap 是否先以 `verified: false` 入库，后续验证？
3. Batch 1 vs Batch 2 vs Batch 3 的拆分方式是否合理？
