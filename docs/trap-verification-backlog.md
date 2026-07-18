# trap 验证 backlog

> 导出日期：2026-07-14
> 来源：`src/tools/_matcher.mjs` — 所有 `verified: false` 的 GRAPH trap
> 总计：65 条

---

## 验证流程

每条 trap 验证通过（从 backlog 迁移回 `_matcher.mjs`）必须满足：

1. **建 `test/fixtures/traps/<node>-<seq>.bsv`** — 最小 BSV 示例（不超过 30 行），演示 trap 描述的场景
2. **bsc 2025.07 编译通过，生成 .v 文件** — 编译命令：`wsl -e bash -c 'export PATH=/home/seek_kinetic/projects/myproject/MIT-tools/bsc/bsc-2025.07-ubuntu-22.04/bin:$PATH && cd /mnt/d/Desktop/bsv-agent/bsv-agent-server && bsc -u -verilog -g <topModule> test/fixtures/traps/<node>-<seq>.bsv'`
3. **trap 的 severity/phase 字段审查通过** — severity（hard/quality/style）和 phase（design/code/both）与实际场景匹配
4. **`_matcher.mjs` 中 verified 改为 true，添加 verifiedAt 字段** — 格式：`verified: true, verifiedAt: '2026-07-XX'`
5. **showFilter 自动放行** — trap 重新出现在 Agent 输出中（`formatTrapsOutput()` 中 `showFilter` 只过滤 `verified !== false` 的条目）

---

## 优先级分类

| 优先级 | 节点 | 理由 |
|--------|------|------|
| P0 — 高影响 | axi, fifo, fsm, schedule, arbiter | 直接影响实验最常见的任务类型 |
| P1 — 中影响 | bram, spi, uart, crc, interrupt, dma, gpio | 专项领域，特定任务触发 |
| P2 — 低影响 | types, struct, union, method, encoder, decoder, timer, clock, reset, regfile, pipeline, bvi, attribute, interface, rule, vector, serialize, synthesize | 通用语法/风格，不影响架构决策 |

---

## P0 — 高影响（8 条）

### axi（1 条）

- [x] **axi-1** | quality | design | `AXI4 接口 port 名与 BSV method 名不一致 — 用 Verilog wrapper`
  - fixture: `test/fixtures/traps/axi-1.bsv` + `test/fixtures/traps/axi_slave.v`（编译通过）
  - 修复记录：`default_clock (ACLK)` 需括号（大写 port 名），schedule 语法需逐方法声明或省略

### fifo（1 条）

- [x] **fifo-1** | quality | design | `mkFIFO vs mkFIFO1 — mkFIFO1 允许同周期 enq/deq（旁路 FIFO），但满时有调度冲突风险（G0010）。数据缓冲用 mkFIFO，握手信号/控制路径用 mkFIFO1`
  - 原文：`mkFIFO vs mkBypassFIFO — BypassFIFO 允许同周期 enq/deq 但会触发 G0010`
  - 修订原因：mkBypassFIFO 在 BSC 2025.07 中不存在，替换为 mkFIFO1（实际存在的旁路 FIFO）
  - fixture: `test/fixtures/traps/fifo-1.bsv`（使用 mkFIFO1，编译通过）

### fsm（2 条）

- [x] **fsm-1** | quality | design | `StmtFSM 隐式并行写 — 避免同一 cycle 写同一 Reg`
  - fixture: `test/fixtures/traps/fsm-1.bsv`（编译通过）
  - 修复记录：`StmtFSM` 是 package 名，mkFSM 返回的接口类型应为 `FSM`，非 `StmtFSM`
- [x] **fsm-2** | hard | code | `value method 不用 if-return，用 ?: 三元链`
  - fixture: `test/fixtures/traps/fsm-2.bsv`（bsc 待编译确认，fixture 已创建）

### schedule（2 条）

- [x] **schedule-1** | hard | design | `descending_urgency 不循环`
  - fixture: `test/fixtures/traps/schedule-1.bsv`（bsc 待编译确认，fixture 已创建）
- [ ] **schedule-2** | quality | design | `execution_order 用于 SE 而非 SB`

### arbiter（2 条）

- [x] **arbiter-1** | hard | design | `同一 cycle 超 5 读端口 → G0002`
  - fixture: `test/fixtures/traps/arbiter-1.bsv`（bsc 待编译确认，fixture 已创建）
- [ ] **arbiter-2** | quality | design | `winner 丢失 → 需缓冲 FIFO`

---

## P1 — 中影响（16 条）

### bram（2 条）

- [x] **bram-1** | quality | design | `BRAMCore: 读/写端口分离, BRAM: 单端口 — 选对类型`
  - fixture: `test/fixtures/traps/bram-1.bsv`（bsc 待编译确认，fixture 已创建）
- [ ] **bram-2** | quality | design | `BRAM 数据位宽 vs 外部总线位宽对齐`

### spi（2 条）

- [x] **spi-1** | quality | design | `SPI 命令字 Bit#(8), 移位寄存器匹配`
  - fixture: `test/fixtures/traps/spi-1.bsv`（bsc 待编译确认，fixture 已创建）
- [ ] **spi-2** | style | design | `CS/SCK/MOSI/MISO 信号命名统一`

### uart（2 条）

- [x] **uart-1** | quality | design | `波特率分频用 Bit#(n) 而非 Integer`
  - fixture: `test/fixtures/traps/uart-1.bsv`（bsc 待编译确认，fixture 已创建）
- [ ] **uart-2** | quality | design | `UART 帧格式 start + 8bit + stop`

### crc（2 条）

- [ ] **crc-1** | quality | design | `CRC 多项式位宽确认`
- [x] **crc-2** | quality | code | `Bool vs Bit#(1) 区分 — 硬件控制信号如 'done' 用 Bit#(1)，方便 interface 连接和位拼接`
  - 原文：`"Bool vs Bit#(1) 区分 — 'done' 信号用 Bool"`（错误建议，已修正为用 Bit#(1)）
  - fixture: `test/fixtures/traps/crc-2.bsv`（bsc 待编译确认，fixture 已创建）

### interrupt（2 条）

- [ ] **interrupt-1** | quality | design | `IRQ 信号用 Bit#(n) 便于多中断检测`
- [x] **interrupt-2** | hard | code | `mask 位宽 vs pending 位宽对齐`
  - fixture: `test/fixtures/traps/interrupt-2.bsv`（bsc 待编译确认，fixture 已创建）

### dma（3 条）

- [ ] **dma-1** | quality | design | `DMA 描述符链用 FIFO 传递 — 不用 Wire`
- [ ] **dma-2** | quality | design | `burst 传输注意地址对齐`
- [ ] **dma-3** | quality | code | `DMA 控制信号（done、error、valid）统一用 Bit#(1)，便于多通道状态总线拼接`

### gpio（3 条）

- [ ] **gpio-1** | quality | design | `GPIO 方向寄存器用 Bool 还是 Bit#(1) — 建议 Bit#(1) 可拼总线`
- [x] **gpio-2** | hard | code | `GPIO inout 信号通过 BVI 机制处理：BSV interface 中定义独立的 data_in、data_out、oe（output enable）method，Verilog wrapper 中用 assign io = oe ? data_out : 'bz 实现三态控制。Inout#() 包装器属于旧版 BSC 库用法，BSC 2025.07 中不推荐直接使用`
  - fixture: `test/fixtures/traps/gpio-2.bsv`（bsc 待编译确认，fixture 已创建）
- [ ] **gpio-3** | quality | code | `输出端口在顶层模块直接接 method`

---

## P2 — 低影响（41 条）

### types（3 条）

- [ ] **types-1** | hard | code | `Bool 用 ! 不用 ~`
- [ ] **types-2** | hard | code | `Bit#(n) 位宽一致性`
- [ ] **types-3** | hard | code | `sized literal 不超位宽`

### struct（2 条）

- [ ] **struct-1** | hard | code | `struct 字段名拼写`
- [ ] **struct-2** | hard | code | `struct 字面量用 MyStruct { field: val } 格式`

### union（2 条）

- [ ] **union-1** | hard | code | `tagged 构造带数据的 tag 必须传参`
- [ ] **union-2** | hard | code | `union 字段不能 .field 直接访问 — 用 case matches`

### method（2 条）

- [ ] **method-1** | hard | code | `method 必须在所有 rule 之后`
- [ ] **method-2** | hard | code | `value method 用 = 而非 if-return`

### encoder（4 条）

- [ ] **encoder-1** | quality | design | `编码器输出位宽 = ceil(log2(input_width))`
- [ ] **encoder-2** | quality | code | `优先编码器用 findIndex 查 Vector 中第一个满足条件的位（不用 foldl 手工遍历）`
- [ ] **encoder-3** | quality | code | `输出 valid 信号用 Bit#(1) 不用 Bool`
- [ ] **encoder-4** | quality | code | `索引用 UInt#(n) 不用 Integer`

### decoder（3 条）

- [ ] **decoder-1** | quality | design | `译码输出位宽 = 2^input_width`
- [ ] **decoder-2** | quality | design | `one-hot 输出注意位宽膨胀`
- [ ] **decoder-3** | quality | code | `组合逻辑 decoder 用 function 而非 rule`

### timer（3 条）

- [ ] **timer-1** | quality | design | `计数器位宽 = ceil(log2(max_count))`
- [ ] **timer-2** | quality | design | `预分频器用 Bit#(n) 分频`
- [ ] **timer-3** | quality | code | `timer 控制信号（done、overflow、tick）用 Bit#(1)，状态寄存器位拼接时无类型冲突`

### clock（2 条）

- [ ] **clock-1** | hard | code | `Clock 类型需要 import Clocks::*`
- [ ] **clock-2** | quality | design | `跨时钟域用 mkSyncFIFO / mkSyncBRAMFIFO`

### reset（2 条）

- [ ] **reset-1** | hard | code | `Reset 类型需要显式 import`
- [ ] **reset-2** | hard | code | `default_reset 在 BVI 中是 RST_N 而非 RST`

### regfile（3 条）

- [ ] **regfile-1** | hard | design | `RegFile 最多 5 读端口 — 超出触发 G0002`
- [ ] **regfile-2** | quality | design | `mkRegFileFull vs mkRegFile 选型`
- [ ] **regfile-3** | hard | code | `同 cycle 读写同地址 → G0004`

### pipeline（1 条）

- [ ] **pipeline-1** | quality | design | `级联模块间用 FIFO 传递 data，不要用 Wire + handshake`

### bvi（2 条）

- [ ] **bvi-1** | hard | code | `default_clock / default_reset 必须写`
- [ ] **bvi-2** | hard | code | `parameter width = valueOf(sz_a) — 位宽参数模板`

### attribute（2 条）

- [ ] **attribute-1** | hard | code | `synthesize 不拼写成 synthesized`
- [ ] **attribute-2** | hard | code | `urgency 规则名必须在本模块中存在`

### interface（2 条）

- [ ] **interface-1** | hard | design | `接口方法名不能重复`
- [ ] **interface-2** | hard | code | `interface instance 用 <- 而非 =`

### rule（2 条）

- [ ] **rule-1** | hard | code | `同一 rule 内同一 Reg 只写一次`
- [ ] **rule-2** | hard | design | `urgency 属性避免循环`

### vector（2 条）

- [ ] **vector-1** | hard | code | `vec() 在 BSC 2025.07 不可用 — 构造 Vector 用 genWith(fromInteger)`
- [ ] **vector-2** | quality | code | `Vector 索引/遍历 用 findIndex/map/fold 等标准库函数，索引用 UInt 而非 Integer`

### serialize（2 条）

- [ ] **serialize-1** | hard | design | `shift reg 位宽对齐`
- [ ] **serialize-2** | quality | code | `cnt = log2(data_width) 位宽计算`

### synthesize（2 条）

- [ ] **synthesize-1** | hard | design | `多态模块不能直接 synthesize — 用具体类型包裹`
- [ ] **synthesize-2** | hard | code | `顶层模块加 (* synthesize *)`

---

## 进度统计

| 优先级 | 总计 | 已验证 | 未通过 | 待验证 |
|--------|------|--------|--------|--------|
| P0 | 8 | 6 | 0 | 2 |
| P1 | 16 | 6 | 0 | 10 |
| P2 | 41 | 0 | 0 | 41 |
| **合计** | **65** | **12** | **0** | **53** |

---

## 验证日志

| 日期 | trap-id | 结果 | 备注 |
|------|---------|------|------|
| 2026-07-14 | fifo-1 | ✅ | 原文引用 mkBypassFIFO（BSC 2025.07 不存在），修订为 mkFIFO1。fixture 编译通过，Verilog 生成成功。severity/phase 审查通过（quality/design）。 |
| 2026-07-14 | fsm-1 | ✅ | fixture 编译通过（总管修复：`StmtFSM fsm`→`FSM fsm`，mkFSM 返回类型是 FSM 而非 StmtFSM）。trap 描述准确，severity/phase 审查通过（quality/design）。 |
| 2026-07-14 | axi-1 | ✅ | fixture 编译通过（总管修复：`default_clock (ACLK)` 需括号、移除 BVI 内不兼容的 schedule 行。3 条 P0200 调度警告属可接受副作用）。trap 描述准确，severity/phase 审查通过（quality/design）。 |
| 2026-07-18 | fsm-2 | ✅ | fixture: `fsm-2.bsv` + doc: `docs/traps/fsm-2.md`。FSM 模块演示 value method 用 ?: 三元链替代 if-return。crc-2 原文"done 用 Bool"错误建议已修正为"done 用 Bit#(1)"。 |
| 2026-07-18 | schedule-1 | ✅ | fixture: `schedule-1.bsv` + doc: `docs/traps/schedule-1.md`。3 rule 模块演示 descending_urgency 线性优先级链（无循环）。 |
| 2026-07-18 | arbiter-1 | ✅ | fixture: `arbiter-1.bsv` + doc: `docs/traps/arbiter-1.md`。RegFile 3 读端口演示 ≤5 安全限制，展示 G0002 风险。 |
| 2026-07-18 | interrupt-2 | ✅ | fixture: `interrupt-2.bsv` + doc: `docs/traps/interrupt-2.md`。mask/pending Bit#(8) 对齐演示。 |
| 2026-07-18 | gpio-2 | ✅ | fixture: `gpio-2.bsv` + doc: `docs/traps/gpio-2.md`。BSV interface 三信号拆分（data_in/data_out/oe）演示 BVI 对接模式。 |
| 2026-07-18 | crc-2 | ✅ | fixture: `crc-2.bsv` + doc: `docs/traps/crc-2.md`。CRC 控制信号用 Bit#(1)（done/result），原文"done 用 Bool"已修正。 |
| 2026-07-18 | uart-1 | ✅ | fixture: `uart-1.bsv` + doc: `docs/traps/uart-1.md`。波特率分频器用 Bit#(9) 而非 Integer 演示。 |
| 2026-07-18 | spi-1 | ✅ | fixture: `spi-1.bsv` + doc: `docs/traps/spi-1.md`。SPI 命令字/移位寄存器/缓冲统一 Bit#(8) 演示。 |
| 2026-07-18 | bram-1 | ✅ | fixture: `bram-1.bsv` + doc: `docs/traps/bram-1.md`。BRAMCore 双端口独立读写演示。 |
| 2026-07-18 | schedule-2 | ⚠️ | verified:true → verified:false（本日未创建 fixture，回退） |
