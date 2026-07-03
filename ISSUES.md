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
- [ ] 验证：`npx specmate` 可正常启动

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

## #9 国际化文档

**标签**：`docs` `future`

**描述**：

当前 `docs/TUTORIAL.md` 和 `docs/reference/` 只有中文版。

**待办**：
- [ ] `docs/TUTORIAL.en.md` 英文版
- [ ] `docs/reference/*.md` 英文版
- [ ] 双向链接（🇨🇳/🇬🇧 切换）
