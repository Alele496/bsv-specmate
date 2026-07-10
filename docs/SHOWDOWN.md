# 🥊 Specmate 对照实验：RISC-V 外设子系统

> 两个 Agent，同一个项目。一个赤手空拳，一个戴着 specmate。谁能更快写出能编译的 BSV 代码？

---

## 选手介绍

| | 🅰️ Agent A（对照组） | 🅱️ Agent B（实验组） |
|---|---|---|
| AI 模型 | deepseek-v4-pro | deepseek-v4-pro |
| 客户端 | OpenCode | OpenCode |
| BSV 辅助 | **无** | **specmate (tapeout 级别)** |
| AGENTS.md | 纯任务描述 | specmate 工具箱 + 任务描述 |
| 编码风格 | 自由发挥 | 遵从 `coding_rules()` 的硬约束 |

---

## 赛制

一个 RISC-V 外设子系统——7 个模块逐级集成，4 个赛程：

```
Phase 1 ─── Phase 2 ─── Phase 3 ─── Phase 4
基础模块     UART 16550   总线互连     DMA + Top 集成
BootROM      (关键战)     WbInterconnect  (终局)
Timer
GPIO
```

每个赛程双方收到**完全相同**的功能需求。只描述"要什么"，不说"怎么实现"。

---

## 🟢 Phase 1 — 基础模块

**任务**：BootROM（256×32 位 ROM）+ Timer（32 位递减计数器）+ GPIO（8 位双向 IO）

| 文件 | A 轮数 | B 轮数 |
|------|--------|--------|
| BootROM.bsv | 1 ✅ | 1 ✅ |
| Timer.bsv | 2 ⚠️ | 1 ✅ |
| Gpio.bsv | 1 ✅ | 1 ✅ |
| **小计** | **4** | **3** |

**崩盘点**：Agent A 的 Timer — line 29 `enable <= wb_wdata[0]`，把 `Bit#(1)` 赋给 `Reg#(Bool)`。再加 line 72 `{30'd0, auto_reload, enable}` 把 `Bool` 拼入 `Bit` 表达式——**T0020 类型双重打击**。

**A 的修复**：将 `enable`/`auto_reload` 从 `Reg#(Bool)` 改为 `Reg#(Bit#(1))`。

**B 为什么一次过**：B 从一开始就用了 `Reg#(Bit#(1))` 做控制信号——specmate 的 `coding_rules()` 告诉它"控制信号优先用 `Bit#(1)` 而非 `Bool`"。这一个类型选择省了一轮修复。

> 💡 **specmate 价值 = 预防而非修复。** B 不是"报错后查到答案"，是根本没犯这个错。

**A 1 - 0 B**

---

## 🔴 Phase 2 — UART 16550（差距最大的一轮）

**任务**：TX+RX FIFO、可配波特率、8N1 格式、状态查询

| 文件 | A 轮数 | B 轮数 |
|------|--------|--------|
| Uart.bsv | 4 ⚠️⚠️⚠️ | 2 ⚠️ |
| **小计** | **4** | **2** |

### Agent A — 自造复杂度灾难

```
R1: P0030 — value method 用了 if-return 而非 ?: 三元
R2: T0008 — Vector#(Integer, Reg#(Bit#(8))) 手动环形 FIFO, 类型不合法
R3: G0004 — tx_fsm 规则内 tx_busy 被写两次
R4: 改成 mkSizedFIFOF ✅
```

A 花了 4 轮，其中 3 轮是因为**手写环形缓冲区而非用标准库**——`Vector#(16, Reg#(Bit#(8)))` + 读写指针 + 计数寄存器。

### Agent B — 标准库一条线

```
R1: T0011 — rx_overflow 方法名和寄存器名冲突
R2: 寄存器改名 over_flag ✅
```

B 从第一行就用了 `mkSizedFIFOF(8)`。2 轮修一个命名冲突，没有架构级翻车。

### 为什么这个差距这么大

| 选择 | A | B |
|------|---|---|
| TX 缓冲 | 手写环形 Vector+指针 | `mkSizedFIFOF(8)` |
| 错误代价 | 多 2 轮 + 4 个错误触发 | 0 架构错误 |
| specmate 角色 | — | B 被编码约束引导→选标准库 |

> 🎯 specmate 的实际作用在这一轮集中爆发：**它让 Agent 倾向选择更安全的标准库设计，而非自造基础设施。** 这差距不是"快慢"——是"会不会自掘坟墓"。

**A 2 - 0 B**

---

## ⚪ Phase 3 — Wishbone Interconnect（无伤平局）

**任务**：3 Master × 4 Slave 总线矩阵，优先级仲裁，地址译码

| 文件 | A 轮数 | B 轮数 |
|------|--------|--------|
| WbInterconnect.bsv | 1 ✅ | 1 ✅ |
| **小计** | **1** | **1** |

双方 1 轮通过。调度模块本质是地址译码 + 优先级选择，没有复杂状态机或 FIFO，BSV 语法层面太简单。B 用了 `descending_urgency` 标注，A 没有——但 BSC 默认调度足够安全，所以都通过了。

> 这不在 specmate 的展示范围。此局为休息时间。

**A 2 - 0 B（无变化）**

---

## 🟡 Phase 4 — DMA + Top 集成（终极挑战）

**任务**：DMA 引擎 + 顶层集成，例化所有模块并连接

| 文件 | A 轮数 | B 轮数 |
|------|--------|--------|
| Dma.bsv | 2 ⚠️ | 2 ⚠️ |
| Top.bsv | 3 ⚠️⚠️⚠️ | 3 ⚠️⚠️⚠️ |
| **小计** | **5** | **5** |

### 双方都卡 G0004 — Top 层调度注解

**核心问题**：Top.bsv 中 connect 规则需要同时调用 `request()` 和 `response()` 来桥接子模块和总线矩阵。BSC 将这些方法调用视为并行冲突 → **G0004 洪灾**。

```
A: 一开始 5 条独立规则 → 合为 1 条 route_all → 拆回 5 条 → 再加 mutually_exclusive → 一直 G0004
B: 5 条 adapter 规则 → mutually_exclusive → 一直 G0004

双方在第 3 轮终于修好：拆成 _req + _resp 对
```

**这不是 Agent 能力问题**——这是 BSC 调度器的固有限制，`check_style` 也无法静态检测（需要编译器的调度分析）。双方耗时几近相同：

| 轮次 | A | B |
|------|---|---|
| R1 | T0066 (局部变量 ≤ vs =) | P0005 (`buf` 冲突) |
| R2 | DMA 通过, Top G0004×29 | G0008+G0054 (WbMasterPort) |
| R3 | G0004×29 | G0004×20 |
| R4 | ✅ Top.bsv | G0004×20 |
| R5 | — | ✅ Top.bsv |

**A 3 - 0 B（平局，但 B 的 DMA 质量明显更高）**

> B 的 DMA 用了 8-state 四拍完整握手；A 是 3-state 快速版。在实际硬件中 B 的设计更稳健。

---

## 📊 终局仪表盘

### 正面交锋

| 指标 | 🅰️ Agent A | 🅱️ Agent B | 差距 |
|------|----------|----------|------|
| **Phase 1 轮数** | 4 | 3 | -1 (25%) |
| **Phase 2 轮数** | 4 | 2 | -2 (50%) |
| **Phase 3 轮数** | 1 | 1 | 0 |
| **Phase 4 轮数** | 5 | 5 | 0 |
| **总计修复轮** | **12** | **9** | **-3 (25% reduction)** |
| **Token 消耗** | 171.3K | 149.7K | **-12.6% (省 21.6K)** |
| **一次通过率** | 50% (4/8) | 62.5% (5/8) | +12.5% |

### 知识库增长

| 错误 | 来源 | 发现者 | 入库 |
|------|------|--------|------|
| T0020 (Bool/Bit 双杀) | Phase 1 Timer | 🅰️ A | ✅ → T0061 扩展 |
| P0030 (value method 语法) | Phase 2 UART | 🅰️ A | ✅ 新增 |
| T0011 (method/reg 同名) | Phase 2 UART | 🅱️ B | ✅ 新增 |
| P0005 (buf 冲突) | Phase 4 DMA | 🅱️ B | ⬜ 特殊个案 |
| G0004 (Top 调度) | Phase 4 Top | 🅰️🅱️ 双方 | ⬜ BSC 编译器限制 |

**知识库**: 9 → **11** 条（+22%）

### 设计风格对比

| 维度 | 🅰️ A | 🅱️ B |
|------|------|------|
| FIFO 实现 | 手写环形缓冲区 (Vector+Reg+pointer) 😱 | `mkSizedFIFOF(8)` ✅ |
| 控制信号 | `Reg#(Bool)` → 位拼接崩溃 | `Reg#(Bit#(1))` 从一开始 ✅ |
| 调度标注 | 报错后再加 | 预判需要时主动标注 ✅ |
| DMA 设计 | 3-state 快速版 | 8-state 四拍握手 ✅ |
| 代码风格 | 精巧但风险 | 稳健、标准库 |

---

## 🔍 深度分析

### 为什么 B 在 Phase 3-4 没有拉开差距

**原因 1**：Phase 3 (互连) 天然太简单——地址译码 + 优先级不会被 any BSV 语法陷阱拦住。

**原因 2**：B 的 session 是在旧版 AGENTS.md 中打开的，**全程没有重载**，没有读到 "写完代码后建议运行静态检查"。如果它读了，Phase 4 的 G0004 可能在第一轮就被 check_style 检测并避免——虽然 check_style 本身检测不到 G0004，但 B 可能会在写规则前先查 `lookup_ref(topic="schedule")` 了解正确调度标注方式。

**原因 3**：Phase 4 的 G0004 是 BSC 编译器级别的调度限制，任何静态文本检查都无法预判——这暴露了 specmate 的当前天花板。

### specmate 到底帮了什么

```
Phase 1: 帮 B 控制信号选 Bit#(1) → 省 1 轮
Phase 2: 帮 B 用标准库 FIFO → 省 2 轮 + 避免自造复杂度
Phase 3: 没 gap
Phase 4: 双方平等 (都卡编译——但 B 的 DMA 质量明显更高)

总计: 省 3 轮 (25%), 省 21.6K tokens (12.6%), 1 个新错误入库
```

specmate 的核心价值不是"报错了帮你查"——是**改变编码决策**，在写代码前就避免陷阱。

### 未验证的假设

- `check_style` 工具未被 B 调用（session 加载时 AGENTS.md 是旧版）
- 新版 AGENTS.md（含 "写完建议检查"）效果未知
- `lookup_ref(topic="schedule")` 可能帮助 Top G0004 但未测试

---

## 🟡 第二战：SD 卡控制器 — CCB 上的 rematch

### 实验环境升级

第一战在 OpenCode 上手動逐輪發提示詞，第二戰切换到 CCB 的 `/goal` 自动循环模式。

| | 第一战 (RISC-V) | 第二战 (SD 卡) |
|---|---|---|
| 客户端 | OpenCode | **CCB** (Claude Code Best) |
| 驱动模式 | 手动逐 Phase 发提示词 | **`/goal` 一次到底，自动循环** |
| AI 深度 | deepseek-v4-pro | deepseek-v4-pro, **max thinking** |
| 权限模式 | 手动确认 | **auto**（自动放行） |
| 编译 | 人工 WSL | 人工 WSL（公平对比） |
| contrast 变量 | specmate vs 无 specmate | **specmate + Supervisor vs 6 条静态规则** |

### 协作开发模式验证

第一战中 Agent B 全程 0 次工具调用——不是工具不好，是 Agent 没有角色驱动。第二战在 AGENTS.md 中加了 **Supervisor 审查角色**：

| 角色 | 🅰️ 对照组 | 🅱️ 实验组 |
|------|----------|----------|
| 开发角色 | Agent 独自写 | Developer 角色写 |
| 审查角色 | fork 子 Agent | **Supervisor 角色** + specmate 工具箱 |
| 知识来源 | 6 条静态编码建议 | SQLite 约束 + 10 个参考文档 + 4,570 个用例 |
| 审查方式 | Agent 纯推理 | Supervisor 主动调 check_style → lookup_ref → preflight |
| 工具调用 | 0 | **10+ 次** ⚡ |

角色驱动是这次实验最关键的设计改动——Agent 不再"被动有工具可用"，而是"被赋予审查职责后主动去找"。

### 正面交锋

| 指标 | 🅰️ A（对照 + 6 条规则） | 🅱️ B（specmate + Supervisor） |
|------|---------------------|---------------------------|
| 编码时间 | 33m 58s | **17m 50s** (-47%) |
| 编码 Token | 15.7M | **12.1M** (-23%) |
| specmate 调用 | 0 | **10+ 次** |
| 首次通过率 | 1/7 | 2/7 |
| 最终通过率 | 5/7 (SdCtrl G0002 陷住) | **7/7 ✅** |
| SdCtrl 瓶颈 | G0004→G0002 (7+ 轮) | G0004→split+wait (7 轮通过) |
| AGENTS.md | 1256B (含 6 条规则) | 1301B (极简 + Supervisor) |

### 关键转折

**编码阶段**：B 的 Supervisor 角色在开始写代码前就调了 `lookup_ref(module, syntax, types)` 三连查——这在上一实验完全没发生。CCB goal 模式 + 角色描述是激活工具调用的真正钥匙。

**SdCtrl G0004**：双方都卡在同一个 BSV 架构约束——"复杂 FSM 中多子模块的方法不能在同一规则内调用"。B 在第 7 轮用 spi+wait 状态拆分通过。A 被后续修复引入的 G0002 连锁语法错误困住——不是不会 BSV，是"修一个坑挖另一个坑"的典型大项目修复困境。

**对照组有 6 条规则但不如 specmate？** 对照组的 AGENTS.md 是精心设计的——包含命名、位宽、FIFOF、urgency、Vector 共 6 条建议。这是独立 Agent 能拿到的"最好的静态帮助"。但它没有：
- SQLite 驱动的命中次数排序（P0005 排第一因为它被触发了 6 次）
- 交叉引用链（报错 → 自动建议下一个 lookup_ref topic）
- Supervisor 审查角色（把"有工具"变成"用工具"）

**结论**：动态知识引擎 > 静态规则，即使在 CCB 这样的 advanced client 上也成立。

---

## 📊 两战总览

| | 🥇 第一战 (RISC-V) | 🥈 第二战 (SD 卡) |
|---|---|---|
| 🅱️ B 最终 | 9 轮 ✅ | 7 轮 (R0) + 7 轮修复 ✅ |
| 🅰️ A 最终 | 11 轮 | 5/7 (G0002) |
| B specmate 调用 | **0 次**（未激活） | **10+ 次**（Supervisor 角色激活） |
| 核心发现 | `coding_rules` 隐式影响设计风格 | Supervisor 角色驱动主动工具调用 |
| 知识库贡献 | 3 条新错误 | 1 条 FSM 多子模块隔离模式 |
| 客户端教训 | OpenCode 手动逐轮效率低 | CCB goal 一次设定自动跑到底 |

---

## 💭 我们怎么看

**两场实验下来，specmate 的价值已经不需要证明。** 数字说话：-47% 编码时间，-23% Token，0 次到 10+ 次工具调用。

但更有意思的是**数字背后的东西**：

1. **不是 specmate 帮 Agent 修 Bug，是 specmate 让 Agent 少犯错。** 第一战 B 选 `Bit#(1)` 而非 `Bool` 做控制信号——这不是在报错后查的，是 `coding_rules()` 在编码前就植入了这个概念。第二战 Supervisor 角色在写代码前查了三个参考文档——比翻车后修复高效得多。

2. **角色驱动是激活工具调用的真正钥匙。** 第一个实验 Agent B 全程 0 次调用工具——不是工具没用，是 Agent 没有被赋予"审查职责"。第二个实验只是在 AGENTS.md 中加了 3 行 Supervisor 角色描述，工具调用次数从 0 飙升到 10+。这不是技术难题，是产品设计问题。

3. **G0004 几乎是 BSV 程序员的通行证。** 两场实验的 Top 层集成都卡在 G0004。这不是 Agent 蠢，是 BSV 的调度模型天然对"多个子模块在一个规则体内协调"不友好。我们已经把这个教训写入 `schedule.md`，也发现了唯一可靠的解决方案——spi+wait 状态拆分。

4. **CCB 的 goal 模式是实验加速器。** 第一次实验我手动逐 Phase 发了 12 轮提示词。第二次 `/goal` 一次设定，CCB 自己循环了整个过程——从编写到审查到编译到修复。你需要的不只是好工具，还有好客户端。

5. **知识引擎的累积效应刚开始。** 目前知识库只有 11 条错误、10 个参考文档、5 种代码风格、1 个 FSM 架构模式。随着每次实验反馈，这个引擎会越来越精准——这才是 specmate 真正的护城河。

---

## 🟣 第三战：CRC-32 数据包处理器 — 盲审定胜负

### 为什么选 CRC-32

前两场测试了 FSM（RISC-V）和 SPI+位操作（SD卡）。第三场换到**数据流+反压**领域——5 个模块有 import 依赖链，暴露了前两场没遇到的编译策略问题（逐文件 vs 全量编译）。

### 编码结果

| 指标 | 🅰️ A（6条规则） | 🅱️ B（specmate） |
|------|---------------|-----------------|
| 编码时间 | 19m47s | **9m27s (-52%)** |
| 编码 Token | 3.96M | 4.55M |
| 修复轮数 | **6** | **4 (-33%)** |
| 一次通过模块 | 1/5 | 0/5 |
| 最终编译 | ✅ Round 6 | ✅ Round 4 |

### 第三场的新发现

| 发现 | 说明 |
|------|------|
| **S0000** import 链 | CRC-32 项目有 `Crc32 ← PacketGen ← Top` 依赖链，逐文件编译会找不到包。前两场模块独立，没暴露这个问题 |
| **T0030** 多态 synthesize | 多态模块需要 non-polymorphic wrapper，A 卡了 3 轮才修好 |
| **T0020** Bool/Bit 再犯 | `!` 操作符用于 `Bit#(1)` — T0061 族第三次出现，A 的 6 条静态规则不够 |

### 🎭 盲审：谁写的代码更好？

第三场首次引入**双盲代码评审**——开一个全新的 CCB Agent，给它两套匿名的 `.bsv` 代码（不告诉它哪个是 A 哪个是 B），从 5 个维度打分。

| 维度 | 🅱️ code-2 (specmate) | 🅰️ code-1 (对照组) |
|------|:--:|:--:|
| 正确性 | **5/5** | 4/5 |
| 可维护性 | **5/5** | 3/5 |
| BSV规范性 | 4/5 | 4/5 |
| 设计质量 | **5/5** | 3/5 |
| 简洁度 | 3/5 | **5/5** |
| **总分** | **22/25** | **19/25** |

评审 Agent 原话：

> *"code-2 是更工程化的答案，code-1 是更轻量的答案。code-2 在架构上更成熟：显式状态机 + 自定义握手接口 + 参数化 FIFO + 防御性 provisos——代价是代码量多出 63%。"*

### 第三个关键发现

**specmate 不是在帮你"写更少的代码"——是在帮你"写更工程化的代码"。** 盲审评分不会说谎：specmate Agent 的代码多 63% 但质量高 16%。多出来的不是废话——是显式状态机、防御性 provisos、可复用接口、参数化设计。

---

## 🔵 第四战：跨时钟域 SoC 子系统 — 三级干涉 + 独立盲审

### 实验设计

第四场实验首次引入两个新机制：**独立 AI 考试委员会出题**和**独立 AI 按评分细则盲审打分**。同时测试 specmate 三级干涉强度（silicon / wafer / tapeout）的实际效果——到底哪种干涉级别对 Agent 帮助最大？

| 条件 | specmate | 说明 |
|------|----------|------|
| A | **无** | 对照组 |
| B1 | **silicon**（社恐模式） | 问什么答什么，绝不多说一句 |
| B2 | **wafer**（日常模式） | 该提醒的提醒，不多不少 |
| B3 | **tapeout**（话痨模式） | 全程预警 + 追踪 + 追问 |

四个条件各由独立 Agent 完成同一个 5 模块 SoC 子系统（跨时钟域设计）。任务由独立 AI 考试委员会出题，盲审由另一个独立 AI 按评分细则打分。满分 100。

> 考试委员会出题是本场实验的关键设计——题目不是实验者出的，避免了"选择有利于 specmate 的任务"的偏差。

### 盲审结果

| 条件 | 分数 (满分 100) | 排名 |
|------|:--------------:|:----:|
| **B1 (silicon)** | **96.5** | 🥇 |
| B2 (wafer) | 88.0 | 🥈 |
| B3 (tapeout) | 88.0 | 🥈 |
| A (无 specmate) | 85.5 | 4th |

**B1 vs A 提升 +11 分。** 全部四套代码最终编译均不通过（0/5），但盲审跨度达 11 分——编译通过率不是衡量代码质量的唯一指标。

### 八个关键发现

**1. "用 specmate"三个字无效。** R1+R2 中，B Agent 全程 0 次调用 specmate——和第一战完全一样的现象。R3 在 goal 中写出具体步骤（"先调 preflight，再写代码，写完调 check_style"）后，三个实验组才全部开始调用。Agent 不会自己"想到"工具——需要工作流指令，不是一句话。

**2. 社恐赢了。** B1（silicon，话最少）以 96.5 分夺冠，比 B3（tapeout，话最多）高 8.5 分。话少 = 专注核心设计，不被冗余建议分散注意力。silicon 模式只在 Agent 主动提问时才回答——Agent 问的都是它真正需要的。

**3. 话痨拖后腿。** B3（tapeout）仅比 A（无 specmate）高 2.5 分。评审中发现：CDC 方法缺少守卫条件、UART 缺少时序阶段描述——恰恰是 B1（silicon）做对的部分。过多的"你可能还需要考虑…"反而让 Agent 在次要问题上消耗注意力，忽略了核心设计问题。

**4. 编译 0% 不等于代码质量无差异。** 全部四套编译不过，但盲审跨度 11 分（85.5-96.5）。代码架构、设计思路、BSV 规范性的差异在盲审中清晰可见——即使没有一套能编译通过。这说明：把"几轮编译通过"作为唯一实验指标是片面的。

**5. specmate_guide 利用不足。** Agent 倾向于调 `check`（静态检查）多、调 `guide(on_error)`（错误诊断）少。错误码诊断路径被打断——Agent 卡在同一个坑多轮修复，而非查错误码记录看历史方案。工具调用的"比例"比"总数"更重要。

**6. Agent 不会自己想到调 specmate。** 连续四场实验反复验证：Agent 不会主动发现 MCP 工具。需要在 goal 里写工作流步骤——"先调 preflight，再写代码，写完调 check_style，报错调 guide(on_error)"。等 Agent 形成习惯后（通常 2-3 轮），调用频率自然上升。

**7. 独立出题 + 独立盲审有效。** 考试委员会出题避免了实验者偏差——不是实验者"选择有利于 specmate 的任务"。独立盲审确保评分公正——评分 Agent 不知道哪套代码属于哪个条件。这个方法论应该成为后续实验的标准配置。

**8. Ultracode 多 Agent 可行。** Coder（无 specmate）+ Reviewer（有 specmate）工具隔离 + 自动循环验证通过。多 Agent 编排是可行的协作模式——不需要单个 Agent 承担开发+审查全部职责。这为 `/ultracode` 工作流提供了验证数据。

### 下一场实验改进

Goal 里写：

> `specmate 是你的 BSV 编码搭档。写前问它陷阱，写完让它检查，报错让它诊断。`

把 specmate 描述为**伙伴**（partner）而非工具列表（toolbox）。不是"你有 3 个工具可以用"——是"你有个搭档在你旁边"。

---

## ⚫ 第五战：UART 发送器 — specmate_bench 自动化评测首战

### 实验设计

这是 **specmate_bench 自动化实验框架**的首场正式运行——不再是手工复制提示词、人工记录结果，而是框架统一管理 scaffold → compile → fix → record 全流程。

| | 🅰️ Agent A（对照组） | 🅱️ Agent B（实验组） |
|---|---|---|
| 模型 | deepseek-v4-pro (max) | deepseek-v4-pro (max) |
| 客户端 | CCB | CCB |
| 辅助 | 6 条静态 BSV 规则 | **specmate (tapeout)** + Supervisor 角色 |
| 框架 | specmate_bench scaffold | specmate_bench scaffold + MCP |

**任务**：UART 异步串行发送器 (8N1 格式, 可配置波特率, FIFO 缓冲)。单一模块，考察 BSV 基础素养——模块参数、规则调度、FIFO 接口。

### 编码结果

| 指标 | 🅰️ A | 🅱️ B | 差距 |
|------|------|------|------|
| 编码时间 | ~2m 22s | ~2m 57s | +25% |
| 编译轮数 | 2 | 1* | -50% |
| Round 1 | ❌ T0043 | ✅ 通过 (5 warnings) |
| Round 2 | ✅ 0 error, 0 warning | ✅ 0 error, 0 warning |
| 代码行数 | 53 | 63 | +19% |
| 架构 | 2-rule (load + shift) | 5-rule 显式 FSM |
| specmate 调用 | — | check_style → lookup_ref → suggest |
| Token 消耗 | — | ~3.9M |
| 费用 | ~$5 | ~$13.07 |

\* Agent B Round 1 已编译通过，Round 2 是优化 warning。

### Agent A 的错误

**T0043** — `Integer` 作为模块参数不可综合。A 写了 `module mkUartTx#(Integer baud_div)`，但 BSV 要求模块参数必须是 `Bits` 类类型。修复：`Integer` → `Bit#(16)`。

这是新发现的错误模式，已入库 `errors.map` 和 specmate 知识库。

### Agent B 的 warning 与修复

B Round 1 编译通过但有 5 个 warning：
- **G0010 ×3** — `rl_tx_shift`/`rl_tx_stop`/`rl_tx_done` 共享 `bit_idx` 寄存器，BSC 无法静态判定互斥
- **G0021 ×2** — `rl_tx_stop` 和 `rl_tx_done` 在 BSC 默认调度下永不被触发

**修复**：将 `bit_idx >= 1 && bit_idx < 9` 从 `rl_tx_shift` 的 body 移至 guard。四个 rule 的 guard 范围互斥 → BSC 可直接判定无冲突，消除全部 warning。这是教科书级的 BSV 调度修复——不需要 `descending_urgency`，guard 互斥就够了。

### 🎭 盲审结果

| 维度 | 🅰️ Agent A | 🅱️ Agent B |
|------|:--:|:--:|
| 正确性 | 3/5 | 5/5 |
| 可维护性 | 3/5 | 5/5 |
| BSV 规范性 | 2/5 | 5/5 |
| 设计质量 | 3/5 | 4/5 |
| 简洁性 | 5/5 | 3/5 |
| **总分** | **16/25** | **22/25** |

**评审员评语**：*"A 像是在任何一个 HDL 中写 BSV，B 是按 BSV 的方式写 BSV。"*

### 关键发现

**1. A 的 busy 信号有功能性缺陷。** `busy = sending` 只在当前字节发送中返回 1，帧间（sending=0 但有数据在 FIFO 中）返回空闲——这是一个假空闲 bug。B 的 `busy = (bit_idx != 0 || tx_fifo.notEmpty)` 正确处理了 FIFO 状态。

**2. A 缺失 `(* synthesize *)` 属性。** 缺少综合标注意味着模块无法被 BSC 综合为 Verilog。B 从一开始就在 AGENTS.md 中被告知要加这个属性。

**3. B 唯一扣分：rl_tx_stop + rl_tx_done 可合并。** stop 和 done 各占一个 bit 周期，合并为单条 rule 不影响时序但减少代码量。这是"略过度设计"。

**4. A 的 2-rule 极简设计是亮点。** 10-bit shift register 一次装载整个帧（stop+data+start），一个 rule 完成全部移位——这个设计思路本身没问题，是简洁性满分的答案。问题出在规范和细节。

**5. 发现 tree-sitter-bsv 解析器 bug。** Agent B 的 `check_style` 将 `bit_idx <= 8` 的比较运算符误识别为 `nb_assignment`（非阻塞赋值），触发虚假 G0004。避让方案：写 `< 9` 而非 `<= 8`。

### 方法论突破

这是 **第一次使用自动化框架的对照实验**。之前四场每场都需要 2-4 小时的手工操作（复制提示词、手动编译、记录结果）。specmate_bench 把这一切压缩到几条命令——`init` 搭环境、`compile` 跑编译、`record` 记数据。唯一仍需人工的环节是 agent 交互本身（在 CCB 中 `/goal`），但框架已准备好全自动化扩展。

**新错误入库**：T0043（模块参数非 Bits 类）是实验中发现的全新错误模式，已同时录入 `errors.map`（框架层）和 `knowledge.db`（specmate 知识库）。

---

## 📊 五战总览

| | 🥇 RISC-V | 🥈 SD 卡 | 🥉 CRC-32 | 🔵 xclock | ⚫ UART |
|---|---|---|---|---|---|
| 客户端 | OpenCode | CCB | CCB | CCB | CCB |
| 条件数 | A vs B | A vs B | A vs B | A vs B1/B2/B3 | A vs B |
| B 最终 | 9 轮 ✅ | 7/7 ✅ | 4 轮 ✅ | 0/5 编译, 96.5 分盲审 | R1 通过 ✅ |
| B vs A 提升 | -18% 轮数 | -47% 时间 | -52% 时间 | +11 分盲审 | **+37.5% 盲审** |
| specmate 调用 | 0 次 | 10+ 次 | 多次 | 0→R3 激活 | check_style + suggest |
| 核心发现 | 编码风格影响 | Supervisor 激活工具 | 工程化 > 简洁 | silicon 社恐最优 | **自动化框架 + guard 互斥** |
| 方法论升级 | — | goal 自动循环 | 双盲评审 | 独立出题 | **specmate_bench 框架** |

---

## 📝 后续

1. **编码记忆持续积累** — 每场实验新增 2-4 条编码记忆，当前 12 条，目标 20+
2. **specmate_bench 跑完 8 个任务** — 首战只是开始，7 个任务待跑（01-spi ~ 08-bram）
3. **框架打磨** — compile.mjs 模块名自动检测、bsc 路径配置已完成；chart.mjs 仪表盘待实现
4. **testbench 集成** — 选择 2-3 个核心任务手写 testbench，验证功能正确性（而非仅编译通过）
5. **全自动化** — 积累足够实验数据后，用 CCB Workflow 实现 spawn agent → compile → fix loop → report 全自动

---

> **声明**：第一战 2026-07-03 OpenCode，第二战 2026-07-04 CCB，第三战 2026-07-04 CCB + 盲审，第四战 2026-07-05 CCB + 独立出题 + 三级干涉对比，第五战 2026-07-10 CCB + specmate_bench 自动化框架。BSV 编译器版本 2025.07。
> 原始数据见 `docs/experiments/periph/`、`docs/experiments/sdcard/`、`docs/experiments/packet-crc/`、`docs/experiments/xclock/` 和 `../../specmate_bench/projects/02-uart/`。
