# RISC-V 外设子系统 — 分阶段实验记录

## 测试信息
- 测试时间：2026-07-03
- bsc 版本：2025.07
- SPECMATE_LEVEL (B): tapeout

---

## Phase 1 — 基础模块（BootROM, Timer, GPIO）

#### Agent A（无 specmate）

| 文件 | 编译轮数 | 报错内容 | 最终通过 |
|------|---------|---------|---------|
| BootROM.bsv | 1 | — | ✅ |
| Timer.bsv | 2 | R1: T0020 (Bool/Bit mismatch, line 29+72) → R2: fix | ✅ |
| Gpio.bsv | 1 | — | ✅ |
| **Phase 1 总轮数** | **4** | | |

#### Agent B（specmate）

| 文件 | 编译轮数 | 报错内容 | lookup_error 命中 | 最终通过 |
|------|---------|---------|------------------|---------|
| BootROM.bsv | 1 | — | — | ✅ |
| Timer.bsv | 1 | — | — | ✅ |
| Gpio.bsv | 1 | — | — | ✅ |
| **Phase 1 总轮数** | **3** | | | |

### 分析（Phase 1）
- A 总轮数：4  B 总轮数：3
- 新错误：T0020 (Bool/Bit 拼接+赋值混淆) → 已加入 T0061 扩展

---

## Phase 2 — UART 16550

#### Agent A

| 文件 | 编译轮数 | 报错内容 | 最终通过 |
|------|---------|---------|---------|
| Uart.bsv | 4 | R1: P0030 (value method if-return) → R2: T0008 (Vector#(Integer) 自造FIFO) → R3: G0004 (tx_busy 双写) → R4: fix | ✅ |
| **Phase 2 总轮数** | **4** | | |

#### Agent B

| 文件 | 编译轮数 | 报错内容 | lookup_error 命中 | 最终通过 |
|------|---------|---------|------------------|---------|
| Uart.bsv | 2 | R1: T0011 (method/register 同名冲突) → R2: rename | 否 | ✅ |
| **Phase 2 总轮数** | **2** | | |

### 分析（Phase 2）
- A 总轮数：4  B 总轮数：2 (**差距 2 轮**)
- A 自造复杂度：手动环形 FIFO (Vector+Reg+指针) → 连触发 T0008 + G0004
- B 用 mkSizedFIFOF 直接避开全部三个坑
- 新错误：P0030 (value method 语法) + T0011 (method/reg 同名) → 已入库

---

## Phase 3 — Wishbone Interconnect

#### Agent A

| 文件 | 编译轮数 | 报错内容 | 最终通过 |
|------|---------|---------|---------|
| WbInterconnect.bsv | 1 | — | ✅ |
| **Phase 3 总轮数** | **1** | | |

#### Agent B

| 文件 | 编译轮数 | 报错内容 | lookup_error 命中 | 最终通过 |
|------|---------|---------|------------------|---------|
| WbInterconnect.bsv | 1 | — | — | ✅ |
| **Phase 3 总轮数** | **1** | | |

### 分析（Phase 3）
- 双方 1 轮通过，地址译码 + 优先级过于简单

---

## Phase 4 — DMA + Top 集成

#### Agent A

| 文件 | 编译轮数 | 报错内容 | 最终通过 |
|------|---------|---------|---------|
| Dma.bsv | 2 | R1: T0066 (局部变量用 <=) → R2: fix | ✅ |
| Top.bsv | 3 | R1: G0004×29 → R2: G0004 (合并规则后仍冲突) → R3: 拆_req/_resp 对 | ✅ |
| **Phase 4 总轮数** | **5** | | |

#### Agent B

| 文件 | 编译轮数 | 报错内容 | lookup_error 命中 | 最终通过 |
|------|---------|---------|------------------|---------|
| Dma.bsv | 2 | R1: P0005 (buf) → R2: rename data_buf → R3: G0008+G0054 (WbMasterPort) → R4: 移除模块参数依赖 | ✅ |
| Top.bsv | 3 | R1: G0004 → R2: mutually_exclusive 失败 → R3: 拆_req/_resp 对 | ✅ |
| **Phase 4 总轮数** | **5** (DMA 2+1, Top 3) | | |

### 分析（Phase 4）
- Dma: A 2 轮, B 3 轮 (B 多一轮因为 WbMasterPort 类型导入)
- Top: 双方均 3 轮 — G0004 是 BSC 调度器限制，check_style 无法静态检测
- B 的 DMA 设计质量更高 (8-state 四拍握手 vs A 3-state)

---

## 跨 Phase 汇总

| 指标 | Agent A | Agent B |
|------|---------|---------|
| Phase 1 总轮数 | 4 | 3 |
| Phase 2 总轮数 | 4 | 2 |
| Phase 3 总轮数 | 1 | 1 |
| Phase 4 总轮数 | 5 | 5 |
| **全部总轮数** | **14** | **11** |
| Token 消耗 | 171.3K | 149.7K |
| 新错误发现 | 3 (T0020, P0030, G0004) | 2 (T0011, P0005) |
| 全系统编译 | ✅ Round 4 | ✅ Round 5 |

## 新错误入库清单

| 错误码 | Phase | 现象 | 已入库 |
|--------|-------|------|--------|
| T0020 (T0061 扩展) | P1 | Bool/Bit 拼接+赋值混淆 | ✅ |
| P0030 | P2 | value method if-return 语法 | ✅ |
| T0011 | P2 | method/register 同名冲突 | ✅ |
| T0066 | P4 | 局部变量误用 <= | ⬜ |
| G0008+G0054 | P4 | 模块参数类型导入 + 注解识别 | ⬜ (BSC 个案) |

---

## 跨 Phase 汇总

| 指标 | Agent A | Agent B |
|------|---------|---------|
| Phase 1 总轮数 | 4 | 3 |
| Phase 2 总轮数 | 4 | 2 |
| Phase 3 总轮数 | | |
| Phase 4 总轮数 | | |
| **部分总轮数** | **8** | **5** |
| 新错误发现 | 3 (T0020, P0030, G0004) | 1 (T0011-class) |

## 新错误入库清单

| 错误码 | Phase | 现象 | 已入库 |
|--------|-------|------|--------|
| T0020 (T0061 扩展) | P1 | Bool/Bit 拼接+赋值混淆 | ✅ |
| P0030 | P2 | value method if-return 语法 | ✅ |
| T0011 | P2 | method/register 同名冲突 | ✅ |
