# specmate：给 AI Agent 装一层 BSV 编码记忆，编译少翻车

现在的 AI Agent 写主流语言是真的猛。读完整个代码库，撸起袖子就帮你改 bug、加功能、重构模块——Python、JS、Rust，指哪打哪。

然后你让它写 100 行 BSV。

编译。翻车。改一下再编译。又翻车。换个 Agent 重来——**同一个坑**。

不是 Agent 蠢。是 BSV 的训练数据太老了。`vec()` 在 2025 版编译器里已经废弃，AI 照写不误。`priority` 是 SystemVerilog 保留字，AI 拿来做变量名，编译直接 P0005。Bool 居然拼进 Bit 表达式——编译器告诉你 T0061，AI 一脸茫然。

更绝望的是：每次编译报错都是一次性消耗品。Agent 修完了就忘了。下一次换一个新会话，换一个模型，同样一个 G0004，踩三遍。这就是冷门领域的结构性困境——**不是 Agent 记性不好，是它根本没有记忆机制。**

---

## 不是又写了一篇 AGENTS.md

很多人第一反应：写个 AGENTS.md 把规则列上不就行了？

试过了。第一场实验里 Agent B 全程 **0 次** 调用工具——不是规则写得不好，是 Agent 根本不知道这些规则的存在。写一堆 MD 文件放在仓库根目录没有用——Agent 不会主动读。

所以我做了 **specmate**：一个通过 MCP 协议嵌入 AI Agent 的 BSV 编码知识引擎。它不是发号施令的老板，是蹲在 Agent 身后的 mate——写代码时提醒、编译前检查、报错了诊断。像个记仇的 code buddy。

---

## 三层架构

specmate 的核心不是"写更多规则"，而是让 Agent 有记忆、有预判、有干涉深度的能力。

### Layer 1：编码记忆（Coding Memory）

底层是 SQLite。每条编译错误存一条记录：错误码、现象、原因、修复方案。Agent 每次查到已记录的错误 → 命中 +1，高频自动排第一。

```text
P0005 标识符与 SV 保留字冲突   ×6  ← Agent 踩得最多
G0010 跨 rule 方法调用冲突     ×3
G0004 rule 内并行写冲突        ×2
T0061 Bool/Bit 类型混淆        ×3
...
```

当前 12 条，每次真实编译报错后 Agent 调 `specmate_learn` 自动入库。它不是手写的静态文档——是靠一次次实战喂出来的。

### Layer 2：知识图谱 + 约束链

顶层是知识图谱：22 个 BSV 领域节点（FIFO、Pipeline、BRAM、Clock、AXI、SPI、FSM、BVI……），每个节点关联：

- **errors**：这个领域的高频错误码
- **refs**：该看的参考文档
- **traps**：让人头大的陷阱

Agent 说 "我在写一个 AXI4 Stream FIFO 带 BRAM" → 关键词匹配命中 FIFO、Pipeline、AXI、BRAM 四个节点 → specmate 合并结果："注意 G0010（上次有人在这翻了三次），参考 schedule 文档，Pitfall：BypassFIFO 会触发 G0010，换 mkFIFOF。"

中间层是约束链：check_style 检测到 G0004 → 返回信息里带钩子 "💡 specmate_guide(phase='decide', input='G0004 怎么拆 rule')" → Agent 自然追下去。不是给你 8 个孤立的函数调用，是给一条"发现问题→找答案"的路径。

### Layer 3：三级干涉

specmate 有三种性格。同一个工具，话多少看你选哪档：

| Level | 性格 | 行为 |
|-------|------|------|
| **`silicon`** 😶 社恐模式 | 你问什么我答什么，绝不多说 | 修 bug、已知问题 |
| **`wafer`** 💬 日常模式（默认） | 该提醒的提醒，该引用的引用 | 日常开发 |
| **`tapeout`** 📢 话痨模式 | 编码前预警、写完提醒、报错后追着问 "修好没？" | 新模块、追求质量 |

这在 MCP 这个"被动应答"框架下是件挺有意思的事——Agent 不问你你不能主动推。那怎么让它多问？靠钩子：每次 specmate 返回末尾带 "🔮 接下来可能遇到……需要展开就调 specmate_guide"，Agent 大概率就接着调了。用响应种下一次调用——不 push，用 hook。

---

## 3 个工具，5 个 phase

Agent 面对的只有 3 个 MCP 工具。不用背 8 个工具名和参数——只记"问问题、检查代码、学新错误"。

| 工具 | 做什么 | 示例 |
|------|--------|------|
| **`specmate_guide`** | 知识导航入口 | `specmate_guide(phase="pre_code", input="SPI 控制器")` |
| **`specmate_check`** | 编译前静态检查 | `specmate_check(files=["bsv/Top.bsv"])` |
| **`specmate_learn`** | 新错误入库 | `specmate_learn(code="G0124", ...)` |

`specmate_guide` 内部 4 个 phase：

```text
pre_code  → 编码前陷阱预测（"你要写 FIFO pipeline？注意 G0010"）
on_error  → 编译报错诊断（"G0004？上次有人在 CRC 项目也遇到了，方案在这里"）
decide    → 方案选择（"mkFIFO vs BypassFIFO？按你的场景用 mkFIFOF 就够了"）
continue  → 下一步预判（"接下来写命令解析？注意 Tagged Union 语法"）
```

`specmate_check` 内部跑 18 条正则规则：方法顺序、Bool 运符错误、SV 保留字冲突、字面量溢出（`5'd40` 值 40 塞不进 5 bits）、结构体字段名不存在、参数个数不匹配——**不调 bsc，纯静态，秒出结果**。

---

## 🥊 三场 Showdown

三场对照实验。相同需求，唯一变量是 specmate。第三场甚至拉了第三个 Agent 来做双盲评审——它不知道哪套代码是谁写的。

| | Round 1: RISC-V 外设 | Round 2: SD 卡控制器 | Round 3: CRC-32 |
|---|---|---|---|
| 模式 | OpenCode solo | CCB × 协作 | CCB × 盲审 |
| A（无/static rules） | 11 轮修复 | 33m58s, 5/7 通过 | 19m47s, 19/25 分 |
| **B（specmate）** | **9 轮 (-18%)** | **17m50s (-47%), 7/7 ✅** | **9m27s (-52%), 22/25** |

Round 2 的 -47% 编码时间、Round 3 的双盲 22 vs 19 分，两张表说话就够了。

但更有意思的是一个发现：

**Round 1：Agent B 全程 0 次调用 specmate。**

不是工具不好——是 Agent 根本不知道有 mate 可以用。第二场我们给了 Agent 一个 Supervisor 审查角色——"你的职责是检查代码质量"。突然开窍了。10+ 次主动调用。

> 三行角色描述 > 六条编码规则 > 什么都不写。

这是整个项目最重要的产品发现。不是工具不够多，是 Agent 需要知道"为什么问"而不只是"怎么问"。

---

## 怎么用

```bash
npm install -g bsv-specmate
```

CCB / Claude Code 用 `.mcp.json`，OpenCode 用 `opencode.json`，三行配置：

```json
{ "mcpServers": { "bsv-specmate": { "command": "npx", "args": ["bsv-specmate"] } } }
```

挂上即用。Agent 自动发现 3 个工具。无需 AGENTS.md 配十几行工具说明——specmate 自己会告诉 Agent 它能做什么。

新项目用协作模板（Supervisor + Developer），小改动用独立模板。模板都在仓库里，复制即用。

---

## 不只是 BSV

在做 specmate 的过程中发现，这套模式不限于 BSV。任何冷门语言、任何 AI 训练数据覆盖不到的领域，都可以用同样的"编码记忆引擎"解决"Agent 每次从头学一遍"的问题。

我把这套架构提取成了一个框架——**Kova**（Knowledge Vault，领域知识引擎框架）。目前还在打磨中，仓库完善后会公开。specmate 是 Kova 在 BSV 领域的第一个完整实例。

思路很简单：MCP 框架下，每个领域都搞一个 coding mate——蹲在 Agent 肩上的专家。你写代码，它记坑。下次同一个坑，碰都碰不到。

---

> **specmate GitHub**：[github.com/Alele496/bsv-specmate](https://github.com/Alele496/bsv-specmate)
> **npm**：`npm install -g bsv-specmate`
> **当前版本**：v0.1.0 | v0.2.0 开发中（3 工具 + 知识图谱 + 18 规则）

---

## 配图清单

| 位置 | 图 | 来源 |
|------|-----|------|
| 开头 | specmate README 前几行截图 | 自截 |
| 三层架构 | 架构草图：SQLite → 知识图谱 → MCP 工具 | draw.io 或手绘 |
| 三场实验 | 三场对比数据表（表格） | SHOWDOWN.md |
| 三级干涉 | 社恐😶/日常💬/话痨📢 三档卡片 | 自截或 PPT 拼 |
| 怎么用 | npm install + .mcp.json 代码 | 自截 |
