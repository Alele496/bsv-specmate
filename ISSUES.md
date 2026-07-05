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

## P0005 检测逻辑缺陷：95% 噪音率，实际使用中完全不可用 🔴

**标签**：`bug` `static-check` `critical`

**实测数据**（2026-07-05，4 文件 175 个问题）：
- P0005 占 **166/175（95%）**，全部是误报
- 唯一真问题 T0011 被 BSC 编译器直接捕获

**根因分析**：

1. **下划线分词检测是致命缺陷**：`SEND_BIT` 切成 `SEND` + `BIT`，小写后 `bit` 匹配 SV_ONLY。BSV 大小写敏感，`BIT` ≠ `bit`。同样 `_reg`（`dac_reg`）、`input_data`、`output_fifo`、`bit_cnt` 全部误报。

2. **大小写不敏感的匹配在 BSV 中是错误的**：`Action`（BSV 合法类型）小写后匹配 `action`（SV 保留字）。`Begin`、`End` 同样问题。

3. **BSV 常用命名模式被当成错误**：`_reg` 后缀是 BSV 标准命名约定（寄存器加 `_reg` 区分 wire）；`op_read_input` 这种语义命名被拆出 `input` 片段。

**修复方案**：
- [ ] **紧急**：移除下划线分词检测（`checkReservedWords` 中 lines 174-189 的 underscore-split 逻辑）——这刀下去消掉 ~80% 噪音
- [ ] **紧急**：为 `emitIfReserved` 添加大小写感知——`Action` ≠ `action`，`Begin` ≠ `begin`
- [ ] 添加 BSV 合法标识符白名单：`Action`、`begin`（非列首时是合法语句块）、`end`（非列首时）
- [ ] 改为只对确认为变量声明的 token 做检查（而非全文扫描）
- [ ] 单元测试：真实 BSV 文件（含 `_reg`、`_bit` 后缀、`Action` 类型）零 P0005

**关联**：
- 受影响文件：`src/tools/check_style.mjs`（`checkReservedWords`）
- 实测数据来源：4 文件 175 问题全部误报，95% 来自 P0005

---

## #10 其他 check_style 误报（实测发现）

**标签**：`bug` `static-check`

**P0032** — 把 interface 声明里的 method 签名当成"method 在 rule 前"：
- `interface` 块内 `method Action enq(...)` 是接口定义，不是实现，不应触发 P0032

**G0004** — 未识别 if/else 互斥分支：
- `if (cond) reg <= val1; else reg <= val2;` 是标准 BSV 写法，不存在并行写冲突

**T0080** — 解析不了带类型参数的函数签名：
- `function Bit#(32) build_frame(Bit#(2) chan, Bit#(10) data)` 只识别到 1 个参数

**G0004_FSM** — 不同子模块的方法调用不应触发：
- `start_dac.poll()` + `spi_master.send()` 是两个不同子模块，不存在冲突

---

## #9 国际化文档

**标签**：`docs` `future`

**描述**：

当前 `docs/TUTORIAL.md` 和 `docs/reference/` 只有中文版。

**待办**：
- [ ] `docs/TUTORIAL.en.md` 英文版
- [ ] `docs/reference/*.md` 英文版
- [ ] 双向链接（🇨🇳/🇬🇧 切换）
