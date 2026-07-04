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

第一战结束后，我们换了客户端（CCB goal 模式），换了项目（SD 卡 SPI 控制器），也换了对比变量：**对照组拿到 6 条硬编码的 BSV 编码建议**（AGENTS.md 中），实验组只有极简任务描述 + Supervisor 角色 + specmate。

| 指标 | 🅰️ A（对照 + 6 条规则） | 🅱️ B（specmate + Supervisor） |
|------|---------------------|---------------------------|
| 编码时间 | 33m 58s | **17m 50s** (-47%) |
| 编码 Token | 15.7M | **12.1M** (-23%) |
| specmate 调用 | 0 | **10+ 次** |
| 首次通过率 | 1/7 | 2/7 |
| 最终通过率 | 5/7 (SdCtrl 卡住) | **7/7 ✅** |
| SdCtrl G0004 | 7+ 轮未修复 | 7 轮修完 |

### 关键转折

**编码阶段**：B 的 Supervisor 角色在开始写代码前就调了 `lookup_ref(module, syntax, types)` 三连查——这是上一个实验中完全没发生的行为。CCB goal 模式 + Supervisor 角色描述成功激活了工具调用。

**SdCtrl G0004**：双方都卡在同一个 BSV 架构约束——"复杂 FSM 中多子模块的方法不能在同一规则内调用"。B 最终在第 7 轮用 spi+wait 状态拆分通过。A 仍在 G0002 语法错误中挣扎。

**specmate 的累积效应**：RISC-V 实验中发现的 Top G0004 模式已写入 `schedule.md`，本轮 B 在修复时查了这个文档。SD 卡实验中新发现的 FSM 多子模块 G0004 也已入库——下次实验 Agent 可以直接查阅。

### 对照组有 6 条规则但不如 specmate？

对照组的 AGENTS.md 是精心设计的 6 条编码建议——这是任何独立 Agent 能拿到的"最好的静态帮助"。但：
- 它没有动态 SQLite 约束排序（P0005 命中 6 次排在第一位）
- 它没有交叉引用（报错 → 自动建议 lookup_ref topic）
- 它没有 Supervisor 角色驱动审查流程

**结论**：动态知识引擎 > 静态规则，即使在 CCB 这样的 advanced client 上也成立。

---

## 📝 后续行动

1. **验证新版 AGENTS.md**：重启 B 的 session 重读新文件，重新跑一个 Top 集成，看会不会调 check_style
2. **Phase 4 G0004 经验补入 specmate**：Top 层 connect 规则拆为 _req/_resp 对 + `descending_urgency` 的最佳实践可写入 `docs/reference/schedule.md`
3. **更多实验**：不同模块类型、不同复杂度，持续积累数据

---

> **声明**：此实验于 2026 年 7 月 3 日进行。BSV 编译器版本 2025.07。
> 原始数据和中间代码见 `bsv-test/project-periph/`。
