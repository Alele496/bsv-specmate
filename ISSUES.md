# GitHub Issues — bsv-specmate

以下 Issue 可直接在 GitHub 上创建，或通过 `gh issue create --title "..." --body "..."` 批量导入。

---

## #1 npm 发布：解决 2FA 认证

**标签**：`blocker` `devops`

**描述**：

当前 specmate 包已准备好发布，但 npm 强制要求 2FA 认证。

**待办**：
- [ ] 在 npmjs.com 创建 Granular Access Token（权限：Read and write，勾选 bypass 2FA）
- [ ] `npm set //registry.npmjs.org/:_authToken=<token>`
- [ ] `npm publish --access public`
- [ ] 验证：`npx bsv-specmate` 可正常启动

---

## #2 丰富 BSV 规范文档 (`lookup_ref`)

**标签**：`enhancement` `docs`

**描述**：

当前 `lookup_ref` 只有 4 篇规范文档（module/types/syntax/examples）。需要补充更多 BSV 语言参考，让 Agent 在编码时能精确查询语法和标准库。

**待办**：
- [ ] 从 `BH_lang_ref_guide.pdf` 摘录 BSV 关键字完整手册 → `docs/reference/keywords.md`
- [ ] 整理标准库速查（FIFO, FIFOF, Reg, Vector, RegFile, RWire 等）→ `docs/reference/stdlib.md`
- [ ] 整理调度注解语法（descending_urgency, mutually_exclusive, conflict_free 等）→ `docs/reference/schedule.md`
- [ ] 更新 `lookup_ref.mjs` 的 `VALID_TOPICS` 数组

---

## #3 增加 `check_style` 检测规则

**标签**：`enhancement` `static-check`

**描述**：

当前 `check_style` 只有 5 条正则规则。可从高频编译错误反向推导更多检查项，在编译前拦截。

**建议新增规则**：
- [ ] `import` 语句完整性（缺少 `import X::*` 导致 T0004 类错误）
- [ ] `interface` 内 method 定义规范（参数名/返回值是否有遗漏）
- [ ] `mkReg(0)` vs `mkRegU` 合理性（未初始化值建议用 `mkRegU`）
- [ ] `case` 穷举检查（枚举类型有 default 分支时警告 G0004 风险）
- [ ] 字面量位宽检查（`Bit#(2)` 赋值为 `4` → T0051 风险）

**实现方式**：在 `src/tools/check_style.mjs` 的 `checkFile()` 中添加新的 `checkXxx()` 调用。

---

## #4 蒸馏优质 BSV 设计模式

**标签**：`enhancement` `knowledge` `future`

**描述**：

从 BSC 官方测试套件的 `bsc.bsv_examples/` 中精选模范设计，提炼为可查阅的设计模式文档。不在上下文中加载，通过 `lookup_ref` 按需返回。

**待办**：
- [ ] 筛选 10-20 个高质量示例（FIFO 实现、仲裁器、流水线、状态机等）
- [ ] 提炼通用模式 → `docs/reference/patterns.md`
- [ ] 加入 `lookup_ref` 可查询 topic

---

## #5 警告清单迁入 SQLite

**标签**：`enhancement` `architecture` `future`

**描述**：

当前 `preflight` 模块的 7 条常见设计警告硬编码在 `src/tools/preflight.mjs` 的 `COMMON_WARNINGS` 数组中。随着积累，应迁入 SQLite 支持动态维护。

**待办**：
- [ ] 新建 SQLite 表 `warnings`（字段：id, title, detail, ref, count）
- [ ] `preflight` 改为从 DB 动态读取
- [ ] 新增 `add_warning` MCP 工具
- [ ] 从源文件移除 `COMMON_WARNINGS` 硬编码

---

## #6 启动性能优化

**标签**：`performance` `future`

**描述**：

`lookup_example` 每次搜索遍历全部 4,570 个 `.bsv` 文件做全文匹配。无缓存情况下首次搜索约 0.1-0.3 秒，可接受但可优化。

**方案**：
- [ ] 启动时预建关键词 → 文件路径索引（写入 user data dir 缓存文件）
- [ ] 后续搜索只查索引 → 定向读取文件
- [ ] 或限制搜索深度：只搜前 3 层子目录

---

## #7 Phase 3：集成 bsc 编译（可选加装）

**标签**：`feature` `future`

**描述**：

为有 WSL/Linux/Docker 环境的用户提供可选编译功能。

**待办**：
- [ ] Dockerfile：Ubuntu + bsc + specmate
- [ ] 新增 `compile` MCP 工具：接收 `.bsv` 内容 → 调用 bsc 编译 → 解析 stderr → 匹配已知错误
- [ ] 编译失败自动：返回格式化错误 + 匹配知识库
- [ ] 编译成功：返回生成的 Verilog 路径

---

## #8 更多对照实验

**标签**：`experiment` `ongoing`

**描述**：

用不同类型的 BSV 模块继续对实验，持续积累新的编译错误到知识库。

**建议实验**：
- [ ] 状态机模块（序列检测器）
- [ ] 流水线模块（多级组合逻辑 + 寄存器）
- [ ] 跨时钟域模块（`mkSyncFIFO` 用法）
- [ ] 接口复杂的模块（多接口调度）

每次实验记录到 `RECORD.md`。

---

## P0005 检测逻辑缺陷：`isKeywordContext` 过于宽松，真正的变量名冲突场景被漏掉，注释/字符串误报已修但检测精度需要重写

**标签**：`bug` `static-check` `high-priority`

**描述**：

`check_style.mjs` 中的 `P0005` 检测（变量名与 BSV 关键字冲突）存在根本性逻辑缺陷：

1. **`isKeywordContext` 过于宽松**：当前上下文判断逻辑使用简单的正则跳过注释和字符串，但判断"是否是真正的变量声明/使用上下文"的条件太宽泛。许多非变量名场景（如模块名、方法名中的关键字子串）被误认为合法上下文而放过。
2. **真正的变量名冲突场景被漏掉**：由于上下文判断不精确，一些确实会导致编译错误的变量名冲突（如 `buf`、`priority`、`output` 等在特定语法位置的 SV/BSV 保留字）被跳过检测。
3. **注释/字符串误报已修但不够**：之前修复了注释和字符串内的误报（P0005 不再触发于 `// comment` 和 `"string"` 内），但修复只是绕过而非根本解决——整个检测逻辑需要重写为基于 AST 或更精确的上下文分析，而非正则行匹配。
4. **实际影响**：Phase 4 DMA 实验中，Agent B 的 `buf` 变量名冲突在第一轮编译才暴露（T0011 类错误），而 `check_style` 本应在编译前就拦截。这说明 P0005 检测规则在当前实现下对真实冲突场景的召回率不足。

**待办**：
- [ ] 重写 `checkP0005` 检测逻辑：从基于正则行匹配改为基于上下文 token 分析
- [ ] 精确识别变量声明位置（`Reg#(...)` 左侧、`let` 绑定、`method` 参数、`interface` 定义等）
- [ ] 区分"保留字作为变量名"（应报警）vs"保留字作为类型名/模块名的一部分"（不应报警）
- [ ] 添加 SV 保留字黑名单的完整覆盖（`priority`、`output`、`input`、`buf`、`reg` 等）
- [ ] 单元测试：构造 5 个应报警的场景 + 5 个不应报警的场景，验证召回率和精确率
- [ ] 与 `checkReservedWords` 规则协调：避免重复检测或互相矛盾

**关联**：
- 受影响文件：`src/tools/check_style.mjs`（`checkReservedWords` / 相关 P0005 检测函数）
- 关联 Issue：#3（增加 check_style 检测规则）
- 历史上下文：P0005 是编码记忆库中命中次数最高的错误（×6），说明这是高频痛点，检测精度直接影响 specmate 的预编译拦截能力

---

## #9 国际化文档

**标签**：`docs` `future`

**描述**：

当前 `docs/TUTORIAL.md` 和 `docs/reference/` 只有中文版。

**待办**：
- [ ] `docs/TUTORIAL.en.md` 英文版
- [ ] `docs/reference/*.md` 英文版
- [ ] 双向链接（🇨🇳/🇬🇧 切换）
