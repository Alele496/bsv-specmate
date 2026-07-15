# specmate 知识系统优化方案

> 创建日期：2026-07-15
> 基于讨论结论的实施方案，优先解决三个已被识别的结构性问题。

---

## 背景

specmate 的知识系统（错误数据库、captures 表、traps）有三个已知问题：

1. **错误经验缺乏跨任务统计**：Agent 不知道"P0030 在 AXI 相关任务中出现过 47 次"
2. **captures 表缺乏 session 概念**：无法区分不同任务的捕获记录
3. **缺少自动知识 seed**：新任务无法从历史中受益

---

## 实施方案

### 问题 1：自动 seed（P0）

**目标**：让 Agent 在新对话/新任务中也能获得历史经验，而非从零开始。

**方案**：在 `specmate_scan` 响应末尾增加历史统计数据摘要。

**实施细节**：
- 数据来源：跨 session 的持久化数据库（`specmate.db`），针对 `captures` 表做聚合查询
- 触发时机：每次 `specmate_scan` 调用时
- 查询维度：
  - 当前 task 关键词 -> 匹配领域节点 -> 查询该领域节点关联的错误码历史出现次数
  - 当前 task 关键词 -> 匹配领域节点 -> 查询高频捕获的错误码（Top 3）
- 输出格式示例：
  ```
  ---
  ### 📊 历史经验（跨任务统计）

  ⚠ 注意：P0030（零位宽字面量）在过去 8 个任务中出现过 47 次，
  其中 AXI 相关任务中出现了 12 次。

  当前任务类型相关的 TOP 错误：
  - G0004（rule 内多子模块冲突）：历史出现 23 次
  - T0061（Bool/Bit 混淆）：历史出现 18 次
  - P0030（function 内 return）：历史出现 47 次
  ```
- 不新增独立 MCP 工具，嵌入 `specmate_scan` 响应
- 这是 specmate 的隐性优势：知识越用越强
  - 初期可能数据少、不够准确
  - 随着 captures 积累，统计会越来越有价值
  - 每多一次 resolve，知识库就强一分

**涉及文件**：
- `src/tools/specmate_guide.mjs` — `scan()` 函数中增加历史统计段落
- `src/db/query.mjs` — 可能需要新的聚合查询函数

---

### 问题 2：去重 + Session 概念（P0）

**目标**：区分不同 session 的错误捕获记录，支持按 session 聚合统计；生成唯一 session 标识。

**方案**：
1. **captures 表加 `session_id` 字段**（TEXT，可选）
2. **session_id 由 specmate 内部自动生成**，Agent 不感知
   - 格式：`YYYYMMDD-HHMMSS-<random 4 chars>`，例如 `20260715-143022-a7f3`
   - 生成时机：`specmate_scan` 首次被调用时（首个需要 session 的工具调用时）
   - Agent 不需要传入 session_id，不需要知道 session_id
3. **可选：Agent 传 `task_name` 当人类可读标签**
   - 作为 `specmate_scan` 的可选参数
   - 仅用于回头看时辨识（如 "SPI控制器-v1"）
   - **不作为去重键**：去重由 specmate 内部的 session_id 负责
   - Agent 不需要知晓 session_id 的存在
4. **历史统计查询使用 session_id 做跨任务过滤**
   - "过去 8 个任务" = COUNT(DISTINCT session_id) WHERE ...

**涉及文件**：
- `src/db/schema.mjs` — captures 表加 `session_id` 列 + 迁移
- `src/db/query.mjs` — addCapture 自动关联当前 session_id + 聚合查询函数
- `bin/server.mjs` — specmate_scan 中管理 session 生命周期
- `src/tools/specmate_guide.mjs` — scan() 可选 task_name 参数

---

### 问题 3：统计指标体系（P1）

**目标**：Agent 能感知到编译失败次数、未解决错误数、顽固错误等指标。

**方案**：高频统计嵌入现有工具响应，不新增独立 MCP 工具。

**实施细节**：

| 统计指标 | 数据来源 | 嵌入位置 | 触发时机 |
|---------|---------|---------|---------|
| **编译失败次数**（当前 session） | `captures` 表 `WHERE session_id = ? AND status = 'captured'` | `specmate_capture` 响应末尾 | 每次 capture 后 |
| **未解决错误数**（当前 session） | `captures` 表 `WHERE session_id = ? AND status = 'unresolved'` | `specmate_capture` 响应末尾 | 每次 capture 后 |
| **顽固错误**（跨 session） | `captures` 表 `WHERE code = ? GROUP BY session_id HAVING COUNT > 3` | `specmate_resolve` 响应末尾 | 每次 resolve 时检查 |
| **历史统计摘要** | `captures` 表跨 session 聚合 | `specmate_scan` 响应末尾 | 每次 scan 时 |

**渐进式实施策略**：
1. **先嵌入跑一段时间**（当前方案）：Agent 通过 `specmate_capture` 和 `specmate_resolve` 的响应看到统计
2. **观察 Agent 行为**：如果实际使用中 Agent 频繁需要主动查询统计（而非被动接收），再考虑抽成独立工具
3. **抽成 `specmate_stats` 工具的条件**：
   - Agent 在 bench 实验中多次发起"我失败了多少次"类查询
   - Agent 在没有 capture 触发的情况下需要查看统计
   - 统计指标增加到 5 项以上，嵌在每个响应里太冗长

---

## 实施优先级

```
P0（先做）：问题 3（自动 seed）+ 问题 1（去重 + session）
  └── 这两个问题有依赖关系：去重需要 session_id，历史统计需要去重后的数据

P1（后做）：问题 2（统计指标）
  └── 依赖 P0 完成后的 session_id 基础设施和 capture 数据积累
  └── 先嵌入跑一段时间，根据 Agent 实际行为决定是否抽成独立工具
```

---

## 技术约束

- **所有数据源都用 `specmate.db`（跨 session 持久化数据库）**，不是当前对话上下文
  - Agent 对话结束后上下文丢失，但 specmate.db 保留
  - 新对话中 Agent 调 `specmate_scan` 能看到历史——这是 specmate 的隐性优势
- **session_id 是 specmate 内部实现细节**
  - Agent 不需要知道、不需要传入
  - Agent 只需要传 `task_name`（可选的人类可读标签）
- **不做统计缓存**：每次查询实时聚合，保持数据一致
  - captures 表现在数据量小（< 1000 条），实时聚合无性能问题
  - 未来数据量大时考虑物化视图

---

## 设计决策记录

1. **统计嵌入现有工具 vs 独立工具**：嵌入式。先验证 Agent 是否确实需要主动查询统计
2. **session_id 自动生成 vs Agent 传入**：自动生成。Agent 传入会增加认知负担，且不同的 Agent 实现可能无法可靠传入
3. **task_name 是否作为去重键**：不。task_name 是人类标签，可能重复、可能拼写变化。去重由 session_id 负责
4. **历史统计的初始准确性**：初期数据少不准，但会随着使用量增长变得有价值。不因初始不准就不做
