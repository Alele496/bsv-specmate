# bsv-specmate P0 改进技术规格

版本 0.1.0 -> 0.2.0 | 2026-07-06

## 概述

四个模块，全部增量改动，零新依赖，Node.js 原生 `node:test`。

---

## 涉及文件清单

| 文件 | 模块 | 动作 |
|------|------|------|
| `src/tools/_matcher.test.mjs` | A1 | **NEW** |
| `src/db/query.test.mjs` | A2 | **NEW** |
| `package.json` | A3 | EDIT (scripts.test) |
| `src/tools/ast_query.mjs` | B1/B2/B3/B4 | EDIT (新增4个导出函数 + 修改1个) |
| `bin/server.mjs` | B5/C3 | EDIT (路由分支 + 新工具) |
| `src/db/schema.mjs` | C1 | EDIT (新增 warnings 表 + CRUD) |
| `src/db/query.mjs` | C1 | EDIT (异步封装 + 迁移) |
| `src/tools/warning_diff.mjs` | C2 | **NEW** |
| `src/tools/check_style.mjs` | D1 | EDIT (注释3个检查) |

---

## 接口变更

### 新增导出 (ast_query.mjs)

```
analyzeRuleConflicts(files) -> { crossRule: [...], raw: [...], waw: [...], resource: [...] }
analyzeMethodOrder(tree, source, file) -> [{ rule, moduleName, enqDeqPairs: [...] }]
findImplicitConflicts(tree, source, file) -> [{ wire, writers: [...], readers: [...] }]
```

### 修改导出 (ast_query.mjs)

`analyzeScheduling()` 返回值中 `risk` 字段变更：
- 旧: `'HIGH' | 'LOW' | 'NONE'`
- 新: `'critical' | 'high' | 'medium' | 'low' | 'none'`

### 新增 MCP 工具 (bin/server.mjs)

`specmate_diff` — 对比两次编译之间的 warning 变化

### 新增 DB 表

`warnings` (compile_id, timestamp, files, warning_text, code, line, hash)

### 现有函数签名不变

`schema.mjs`、`query.mjs` 的已有导出函数签名不做任何更改。

---

## 实现步骤

### 模块 A：补测试

**Step A1** — 创建 `src/tools/_matcher.test.mjs`

8 个用例：
1. `extractKeywords` 匹配单个关键字
2. `extractKeywords` 匹配多个关键字（含大小写不敏感）
3. `extractKeywords` 无匹配返回空数组
4. `extractKeywords` 空字符串输入
5. `match` 单关键字返回正确 errors/refs/traps
6. `match` 多关键字合并去重（errors 用 Set 去重，traps 用 Set 去重）
7. `match` 关键字包含 patterns 字段
8. `KEYWORDS` 导出为非空数组

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeywords, match, KEYWORDS } from './_matcher.mjs';
```

**Step A2** — 创建 `src/db/query.test.mjs`

8 个用例，使用 sql.js 内存数据库（与 `ensureDB()` 相同的初始化模式）：
1. `insertError` + `getError` 读写闭环
2. `searchErrors` 关键词搜索
3. `getAllErrors` 返回排序列表
4. `insertCapture` + `getCapturesByCode` 闭环
5. `resolveCapture` 状态变更验证
6. `getUnresolvedCaptures` 过滤正确
7. `getHotTopics` 空 DB 返回空数组
8. `ensureDB` 返回同一实例（单例模式）

测试辅助函数：创建临时 SQL.js 内存 DB，调用 `initDB(db)`，测试间 db.close() 清理。

**Step A3** — 编辑 `package.json`

```json
"scripts": {
  "start": "node bin/server.mjs",
  "test": "node --test src/**/*.test.mjs",
  "db:seed": "node src/db/seed.mjs",
  "db:export": "node src/db/export.mjs"
}
```

---

### 模块 B：深化 AST 分析

所有新函数追加到 `ast_query.mjs` 末尾（冲突检测区），复用已有的 `parseFile()`、`extractRules()`、`extractRegWrites()`、`extractRegDeclarations()`、`extractCalls()`、`extractModules()`、`findAncestor()`、`enclosingRuleName()`、`enclosingModuleName()`、`walk()`、`collectAll()`。

**Step B1** — `analyzeRuleConflicts(files)`

接受文件路径数组，跨文件分析所有 rule 之间的冲突：

1. 对每个文件调用 `parseFile()` 获取 tree + source
2. 调用 `extractRules()` 获取所有 rule 列表
3. 调用 `extractRegWrites()` 获取所有寄存器写入
4. 跨 rule 构建冲突矩阵：
   - **RAW** (Read After Write)：同寄存器被两个 rule 分别写，任一规则读取该寄存器（从 `extractCalls()` 找 `.read` 调用或 Rule 内直接引用）
   - **WAW** (Write After Write)：两个 rule 写同一个寄存器
   - **Resource**：两个 rule 调用同一个子模块的方法（从 `extractCalls()` 的 target 字段判断）
5. 返回 `{ crossRule: [{ file, rule1, rule2, reg, type }], raw: [...], waw: [...], resource: [...] }`

**Step B2** — `analyzeMethodOrder(tree, source, file)`

检测同一 rule 内对同一 target 的 enq/deq 并发（如 `fifo.enq()` 和 `fifo.deq()`）：

1. 用 `extractRules()` 获取所有 rule
2. 对每个 rule，用 `extractCalls()` 获取该 rule 内的方法调用
3. 按 target 分组，检测 `enq` 和 `deq` 是否同时出现在同一 target
4. 返回 `[{ rule, moduleName, line, enqDeqPairs: [{ target, enqLine, deqLine }] }]`

**Step B3** — `findImplicitConflicts(tree, source, file)`

检测 Wire 多写一读的调度依赖（Wire 的 `_write` 和 `_read` 方法）：

1. 用 `extractRegDeclarations()` 或新 walk 找到所有 Wire 声明（`mkWire` / `mkBypassWire` 等）
2. 用 `extractCalls()` 找到所有 `.wset()` / `_write()` / `.wget()` / `_read()` 调用
3. 按 wire 名分组，检测多 rule 写同一 wire
4. 返回 `[{ wire, writers: [{ rule, line }], readers: [{ rule, line }] }]`

**Step B4** — 升级 `analyzeScheduling()` 风险评级

将三值升级为五值：

- `critical`：`targets.size >= 3` 或同时有写入冲突 (`registerWrites.length >= 2`)
- `high`：`targets.size === 2`
- `medium`：`targets.size === 1` 但有方法调用
- `low`：`targets.size === 1` 但无方法调用
- `none`：`targets.size === 0`

同时更新 `bin/server.mjs` 中对应的渲染逻辑（riskIcon 行）。

**Step B5** — `bin/server.mjs` 路由扩展

在 `specmate_analyze` 的 `q` 路由中新增三个分支（在现有调度冲突分支之前或之后）：

- `/冲突矩阵|rule.*conflict|RAW|WAW/i` → 调用 `analyzeRuleConflicts(files)`，格式化输出冲突矩阵表格
- `/enq.*deq|method.*order|并发.*检测|BypassFIFO/i` → 调用 `analyzeMethodOrder()`，输出 enq/deq 并发风险
- `/隐式|implicit|wire.*conflict|Wire.*写/i` → 调用 `findImplicitConflicts()`，输出 Wire 多写依赖

---

### 模块 C：Warning Diff

**Step C1** — DB 层

在 `src/db/schema.mjs` 的 SCHEMA 字符串中新增：

```sql
CREATE TABLE IF NOT EXISTS warnings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    compile_id   TEXT NOT NULL,
    timestamp    TEXT NOT NULL,
    files        TEXT NOT NULL,
    warning_text TEXT NOT NULL,
    code         TEXT,
    line         INTEGER,
    hash         TEXT NOT NULL,
    UNIQUE(compile_id, hash)
);
```

新增 CRUD 函数（追加到 schema.mjs 末尾）：

```
insertWarnings(db, { compile_id, timestamp, files, warnings[] })
getWarningsByCompile(db, compile_id) -> []
getLatestCompileId(db) -> string|null
```

在 `src/db/query.mjs` 中：

1. 在 `ensureDB()` 中追加 warnings 表的迁移 CREATE TABLE IF NOT EXISTS
2. 新增异步封装函数（遵循现有 pattern：ensureDB → 调用 schema 函数 → saveDB）：
   ```
   saveWarnings(compile_id, files, warningLines)  // 解析后存入
   getWarningSnapshot(compile_id) -> []
   getLatestWarningCompile() -> string|null
   ```

**Step C2** — 创建 `src/tools/warning_diff.mjs`

```js
export function diffWarnings(prevCompileId, currCompileId, db)
```

返回：

```js
{
  prevCompileId, currCompileId,
  new: [{ warning_text, code, line }],       // 本次新增
  eliminated: [{ warning_text, code, line }], // 本次消除
  persistent: [{ warning_text, code, line }], // 两次都存在
  summary: { prevTotal, currTotal, newCount, eliminatedCount, persistentCount }
}
```

对比逻辑：以 `hash` 字段为 key（`hash = sha256(warning_text + code + line)` 的简化版，可用 `warning_text` 后 8 字符 + code 做简易指纹），prev 集合 vs curr 集合做差集。

警告信息解析：从 BSC 输出中提取 `Warning: "..."` 行，解析出 code（如 G0004）、行号（如 line 42）、文件路径。

**Step C3** — `bin/server.mjs` 新增 MCP 工具

```js
server.tool("specmate_diff",
  "对比两次 BSC 编译的 warning 变化，追踪新增/消除/持续的 warning",
  {
    prev_compile_id: z.string().optional().describe("上次编译ID，省略则自动取倒数第二次"),
    curr_compile_id: z.string().optional().describe("本次编译ID，省略则自动取最后一次"),
  },
  async ({ prev_compile_id, curr_compile_id }) => { ... }
);
```

---

### 模块 D：精简规则

**Step D1** — 编辑 `src/db/schema.mjs`

在 `check_style.mjs` 的 `checkFile()` 函数 `full=true` 块（第43-60行）中：

1. 注释掉 `checkReservedWords`（对应 P0005）调用，加注释：`// P0005: BSC 的 "possibly a reserved word" warning 已 100% 覆盖，2秒内给出准确结果`
2. 注释掉 `checkMethodOrder`（对应 P0032）调用，加注释：`// P0032: BSC 已检测 "method after rule" 顺序错误`
3. 注释掉 `checkMultiSubmodule`（对应 G0004_FSM）调用，加注释：`// G0004_FSM: BSC 的 schedule 分析已覆盖多子模块冲突`

保留的 Always-on 检查（第38-40行）不变：
- `checkLiteralOverflow` (T0132)
- `checkBoolOperators` (T0061)
- `checkSizedLiteralZero` (T0132)

保留的 Full-scan 检查（保留 BSC 不检查的语义规则）：
- `checkRuleDoubleWrite` (G0004) — regex 快速预筛，比 BSC 快
- `checkVecUsage` (T0004)
- `checkBoolBitMismatch` (T0061)
- `checkValueMethodSyntax` (P0030)
- `checkMethodRegNaming` (T0011)
- 其余结构检查（DupTypeParams、DupValueParams 等）

**注意**：被注释的函数代码保留（不删除），未来如果需要可以快速恢复。注释掉的代码块前后加 `// --- BSC 已覆盖，暂时关闭 ---` 和 `// --- 关闭结束 ---`。

`bin/server.mjs` 中 topicHints 映射表不需修改——P0005/P0032/G0004_FSM 的映射保留，因为 `lookup_error` / `specmate_guide` 路径仍可能通过 crossRef 触发。

---

## 风险点和注意事项

1. **tree-sitter-bsv 解析兼容性**：B1/B2/B3 依赖 tree-sitter 正确解析 BSV。先用 `examples/bsv/` 下的现有文件做 smoke test。如果解析失败，函数返回空结果而非抛异常。

2. **DB 迁移向后兼容**：warnings 表迁移使用 `CREATE TABLE IF NOT EXISTS`，对已有用户透明。

3. **Warning Diff 依赖 Agent 行为**：`specmate_diff` 需要 Agent 先通过编译流程（如 BSC 输出）存入 warnings 表。MCP 工具文档需说明此工作流。**这不是代码 bug，是使用文档问题。**

4. **Module D 注释不删除**：被关闭的检查函数保留在代码中，只是调用点被注释。这样做的好处是代码有历史可查，恢复成本为零。如果用户反馈需要某个检查，取消注释即可。

5. **五级 risk 变更向前兼容**：`analyzeScheduling()` 返回值的 `risk` 字段变更后，`bin/server.mjs` 中的旧 `HIGH/LOW/NONE` 比较需要同步更新（Step B5 已覆盖）。

6. **db.query.mjs 导入更新**：schema.mjs 新增 exports 后，query.mjs 的 import 行需要追加新的函数名。

---

## 测试要点

### 模块 A
- [ ] `node --test src/**/*.test.mjs` 通过，8+8=16 个用例
- [ ] 测试不依赖文件系统（用内存 DB）
- [ ] 测试不依赖网络

### 模块 B
- [ ] 创建 `examples/bsv/conflict_test.bsv` 包含：跨 rule 同 reg 写入、同 rule enq+deq、Wire 多写
- [ ] `specmate_analyze(files=["examples/bsv/conflict_test.bsv"], question="冲突矩阵")` 返回正确的 RAW/WAW/Resource 分类
- [ ] `specmate_analyze(question="enq deq")` 检测到 enq/deq 并发
- [ ] `specmate_analyze(question="wire conflict")` 检测到 Wire 多写
- [ ] risk 评级输出 critical/high/medium/low/none 之一

### 模块 C
- [ ] `saveWarnings()` + `getWarningSnapshot()` 读写闭环
- [ ] `diffWarnings()` 正确计算 new/eliminated/persistent
- [ ] `specmate_diff` 工具在 MCP 客户端可调用
- [ ] 已有 DB 迁移后 warnings 表存在

### 模块 D
- [ ] `specmate_check(files=[...], full=true)` 不再产生 P0005/P0032/G0004_FSM 问题
- [ ] Always-on 检查（T0132/T0061）仍然生效
- [ ] Full-scan 中 G0004/T0004/T0061/P0030 等仍在列表中
