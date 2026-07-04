# 知乎文章草稿 — specmate 编码记忆引擎

> 待 npm v0.2.0 发布后修改版本号和实验数据后再发。

---

# AI 写了 10 万行 Python 没报错，写 100 行 BSV 翻了 6 次车——于是我给 AI 植入了一层"编码记忆"

现在的 AI Agent 写主流语言是真的猛。读完整个代码库，撸起袖子就帮你改 bug、加功能、重构模块——Python、JS、Rust，指哪打哪。

然后你让它写 100 行 BSV。

编译。翻车。

改一下再编译。又翻车。

换个 Agent 重来。还是翻车，**同一个坑**。

---

## 不是 BSV 难，是训练数据里没有新版的语法

BSV（Bluespec SystemVerilog）是冷门硬件描述语言。全球活跃用户可能不到一千人。AI 的训练数据停留在 2020 年之前的版本，而 BSC 编译器 2025 版已经改了若干语法：

- `vec()` 废弃了——Agent 不知道，继续用，编译报 T0004
- `priority` 是 SystemVerilog 保留字——Agent 用它做变量名，报 P0005
- `Bool` 不能拼进 `Bit` 表达式——Agent 不知道这两个类型是不同的，把手写进缝合怪表达式
- 一条规则里调了多个子模块的方法——编译器报 G0004，Agent 反复修 6 轮修不好

每次编译报错都是一次性解决。Agent 修完后**没有形成记忆**。下次另一个会话、另一个模型、甚至同一个 Agent 换个项目——同样的坑，掉进去，爬出来，掉进去。

这就是冷门领域的结构性困境：**不是 Agent 蠢，是它的"知识"过了保质期。**

---

## 编码记忆引擎——让 Agent 不再是"每次从头学 BSV 的实习生"

我做的不是又给 Agent 写一堆 AGENTS.md 规则——试过了，没用。也不是拿训练数据去 fine-tune 一个大模型——约束太多了。

我做的是一个**编码记忆引擎**。

```
每犯一次错 → SQLite 记录一条（错误码 + 现象 + 原因 + 修复方案）
每次查到已记录的错误 → 命中 +1，高频自动排第一
每次启动 → TOP 5 / TOP 10 编码约束排序返回
```

它不是被动知识库——是**动态排序的、会积累的、有自己的"经验"的**编码记忆。Agent 不需要记住每一次翻车，只需在开始写代码前问一句：`coding_rules()`——引擎直接返回："你之前在这几个坑里翻过车，注意。"

---

## specmate：BSV 的编码记忆引擎

这份编码记忆引擎在 BSV 领域的具体实现，就叫 **specmate**。

它的原理不复杂——8 个 MCP 工具，8 条静态质检规则，11 条编码记忆，10 个 BSV 参考文档。但关键设计只有三个：

**1. 编码记忆（Coding Memory）不只是存储，是会排序的**

P0005 命中 6 次排在第一位，G0010 命中 3 次排在第二位。Agent 看到的约束列表不是人类凭直觉排的，是**数据驱动的**。

**2. 质检链（Constraint Chain）不是单个工具，是有向引用图**

```
check_style 检测到 G0004 →
  → 💡 lookup_ref(topic="schedule") 查调度注解
      → 读完后不继续引用别的工具（防止循环）
```

不是给你 8 个孤立的函数调用——是给你一条"发现问题 → 找答案 → 修复"的完整路径。

**3. 角色激活（Role Activation）比工具列表重要 100 倍**

第一场实验：把 7 个工具写在 AGENTS.md 里 → Agent B 全程 **0 次**调用。

第二场实验：把"你是 Supervisor，负责审查代码质量"写进 AGENTS.md → Agent B **10+ 次**工具调用。

三行角色描述 > 六条编码规则 > 什么都不写。这是整个项目最重要的产品发现。

---

## 两场对照实验

### Round 1：RISC-V 外设子系统（OpenCode, solo）

| | Agent A（无 specmate）| Agent B（有 specmate）|
|---|---|---|
| 修复轮数 | 11 | **9 (-18%)** |
| 设计风格 | 手写环形缓冲区 | 标准库 FIFOF |
| 工具调用 | 0 | 0 |

specmate 赢了——但不是因为 Agent 主动调了工具，而是它的 `coding_rules()` 在编码前影响了设计选择（选 FIFOF 不选手写 Vector）。

### Round 2：SD 卡控制器（CCB goal 模式，Supervisor 协作）

| | Agent A（6 条静态规则）| Agent B（Supervisor + specmate）|
|---|---|---|
| 编码时间 | 33m 58s | **17m 50s (-47%)** |
| Token | 15.7M | **12.1M (-23%)** |
| 工具调用 | 0 | **10+ 次** |
| 最终通过 | 5/7 | **7/7 ✅** |

Supervisor 角色激活了工具链。这是编码记忆引擎从"没太大用"到"用得飞起"的转折点。

---

## 怎么用

```bash
npm install -g bsv-specmate
```

CCB / OpenCode / Claude Desktop 配 `.mcp.json` 即可。

新项目用协作模板（Supervisor + Developer），小改动用独立模板。
模板都在仓库里，复制即用。

---

## 不只 BSV——这套架构叫 Kova

在做 specmate 的过程中发现，这套模式不限于 BSV。任何冷门语言、任何 AI 训练数据覆盖不到的领域，都可以用同样的"编码记忆引擎"来解决"Agent 每次从头学一遍"的问题。

于是把这套架构提取成了一个独立框架——**Kova**（Knowledge Vault，领域知识引擎框架）。specmate 是 Kova 在 BSV 领域的第一个完整实例。

---

## 链接

- **specmate GitHub**：https://github.com/Alele496/bsv-specmate
- **specmate npm**：`npm install -g bsv-specmate`
- **Kova 框架**：https://github.com/Alele496/Kova

---

## 配图清单

| 位置 | 图 | 来源 |
|------|-----|------|
| 编码记忆段 | Kova 架构图或 specmate 三层截图 | `kova/README.md` Mermaid 图 |
| 实验段 | 两场实验对比表（表格） | SHOWDOWN.md |
| 怎么用段 | GitHub README 截图 | 自截 |

---

> 待发布前修改：
> - [ ] npm 版本号更新为 v0.2.0
> - [ ] 编码记忆数量更新（当前 11 条）
> - [ ] 实验数据有变化时更新
