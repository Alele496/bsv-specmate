# 议会：specmate 战略落地实施计划

> 日期：2026-07-19 | 基于 07-18 议会决议 + 技术审计 + 战略分析

## 背景

两轮议会讨论的核心结论：

1. **specmate 的护城河不是静态分析精度，是 BSV 领域知识的积累闭环。**
2. **三条检查路径（check_style 正则 / preflight tree-sitter / ast_query tree-sitter）各自独立，G0004 三方重叠，不统一——让 BSC 做最终裁决。**
3. **从"工具"到"平台"的关键一跃：关闭 capture→resolve 自动闭环。**
4. **"我们不更新了，它还能长"——缺了"自动 resolve"这一环。**

---

## 批次一：闭环核心（P0）

### 1.1 自动 resolve：编译通过 → 自动归档上次 capture

**问题**：当前 capture 是自动的（每次编译失败入库），但 resolve 依赖 Agent 手动调 `specmate_resolve`。Agent 忘了，经验就丢了。

**实现**：
- `specmate_check(compile=true)` 编译通过时（bscResult.success === true）
- 检查当前 session 下是否有 `status='unresolved'` 的 captures
- 对比当前文件和上次编译失败的文件是否重叠
- 如果编译通过 + 上次有未解决 capture → 自动标记 `status='resolved'`
- 记录 `cause='auto-resolved: BSC compilation passed'` + `solution='auto-detected'`

**改动文件**：`bin/server.mjs` specmate_check handler (~50 行)

### 1.2 `bsc_verified` 字段：BSC 编译结果标注每条静检告警

**问题**：议会 07-18 决议方案 C 写了"改 50-80 行让 check 结果标注 `bsc_verified: true/false`"，还没实现。当前静检结果和编译结果是拼在一个字符串里的，Agent 无法程序化区分。

**实现**：
- `checkStyle()` 返回的每条 issue 加 `bsc_verified` 字段，默认 `null`（未跑编译）
- `specmate_check(compile=true)` 编译通过时：
  - 解析 bsc 输出中的 warning/error code
  - 匹配静检 issue 的 check code
  - 匹配到的 → `bsc_verified: true`
  - 未匹配到的 → `bsc_verified: false`（静检报了但 BSC 没报 → 可能是误报）
- BSC 报了但静检没查到的 → 记录为"漏检"，追加到输出

**改动文件**：`src/tools/check_style.mjs` checkStyle() + `bin/server.mjs` specmate_check handler (~80 行)

---

## 批次二：变现闭环价值（P1）

### 2.1 P0200 自动修复

**问题**：`detectAutoFixability()` 能标记 P0200 为 `auto`，但只是标签——diagnose 说"能自动修"然后什么都不做。

**实现**：
- 新建 `src/tools/auto_fix.mjs`
- `autoFixP0200(source)` 函数：
  - 正则匹配 `schedule (\w+) (CF|SB|SBR|C) \(([^)]+)\)`
  - 展开为逐对声明：`schedule A CF B; schedule A CF C; ...`
  - 写回 .bsv 文件
- `specmate_check(compile=true)` 中，diagnose 返回 auto-fixable 的 code 后，调用 autoFix → 重新编译验证

**改动文件**：新建 `src/tools/auto_fix.mjs`，`bin/server.mjs` 集成 (~150 行)

### 2.2 三条路径关系文档化

**问题**：check_style.mjs 顶部已加架构注释，但 README 和 architecture.md 没有解释三条检查路径的关系——新用户不清楚什么时候用哪个。

**实现**：
- `docs/specmate-architecture.md` 方向三（静态检查）补充"何时用哪条路径"的决策树
- `README.md` 工具表格中 `specmate_check` 和 `specmate_analyze` 加一句说明互补关系

### 2.3 补完 unverified traps

**问题**：TRAPS 数组有 10 个 `verified: false` 条目，GRAPH 中约一半领域节点的 traps 为空。

**实现**：
- 10 个 unverified trap 补齐 `test/fixtures/traps/<trap>.bsv` 并通过 bsc 编译
- 5 个高频空 GRAPH 节点（axi, pipeline, clock, interface, struct）各补至少 1 个核心陷阱
- 完成后改 `verified: true` + 加 `verifiedAt` 字段

---

## 批次三：平台化基建（P2）

### 3.1 未知错误自动聚类 → 自动生成知识条目

**问题**：`getClusteredCaptures()` 存在但没人调。同一未知错误出现 3 次（跨 2+ session）后，应该自动生成 error doc 草稿。

**实现**：
- MCP 工具或 CLI 脚本 `scripts/auto-cluster.mjs`
- 调 `getClusteredCaptures(minRepeat=3, minSessions=2)` 
- 对每个 cluster：汇总 bsc_output samples → LLM 分析生成 cause/solution → 生成 markdown doc 到 docs/errors/
- 标记 captures 为 `review_status='approved'`

### 3.2 跨 session 热点追踪增强

**问题**：`queryTopErrorCodes()` 只在 scan 末尾输出。Agent 可能没看到。

**实现**：
- `specmate_check` 检查前先查"当前文件的常见错误码 TOP 3"
- 输出开头加 "⚠️ 这个文件历史上最常触发的错误码: G0004(15次)、G0053(8次)、P0030(3次)"

---

## 已完成的改动（不需要重复做）

| 改动 | commit | 状态 |
|------|--------|:---:|
| confidence 字段（19 条规则） | a5e610e | ✅ |
| 5 条 low 规则降级为 info | a5e610e | ✅ |
| check_style.mjs 架构注释 | a5e610e | ✅ |
| G0004 isCaseFsmPattern() 修复 | 209ff47 | ✅ |
| 议会记录（07-18） | a5e610e | ✅ |
| 架构全景文档 | a5e610e | ✅ |
| 战略分析报告 | docs/council/2026-07-19-strategic-review.md | ✅ |
