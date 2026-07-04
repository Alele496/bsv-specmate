# RISC-V 外设子系统 — 分阶段提示词

## 实验前准备

1. OpenCode 窗口 1 → 打开 `A/` → Agent A（对照组，无 specmate）
2. OpenCode 窗口 2 → 打开 `B/` → Agent B（实验组，specmate tapeout 级别）
3. 每个 Phase 发给两个 Agent **相同提示词**

## 你的操作

1. 发送 Phase X 提示词 → 等待双方完成
2. WSL 编译双方输出 → 记录错误到 `RECORD.md`
3. 发编译错误反馈给 Agent，直到该 Phase 全通过
4. 新错误 → `add_error` 入库
5. 进入下一 Phase

---

## Phase 1 — 基础模块

> 发给两个 Agent：

```
实现 3 个硬件模块。按照 AGENTS.md 的接口规范。

1. bsv/BootROM.bsv — 只读指令存储器
   - 256 条 32 位指令字
   - 支持外部按地址读取
   - 初始化时预置几条简单的测试指令
   - 模块名 mkBootROM

2. bsv/Timer.bsv — 可编程定时器
   - 32 位递减计数
   - 支持启动 / 停止
   - 计数到零时触发中断信号
   - 支持自动重载（计数到零后从预设值重新开始）
   - 外部接口可读写计数器和配置
   - 模块名 mkTimer

3. bsv/Gpio.bsv — 通用输入输出
   - 8 个双向引脚
   - 每个引脚可独立配置为输入或输出
   - 输出值可读写，输入值只读
   - 模块名 mkGpio

每个模块独立 package，包名与文件名一致。
```

### WSL 编译

```bash
cd /mnt/d/Desktop/bsv-test/project-periph/A/bsv
for f in BootROM Timer Gpio; do
    echo "=== $f ==="
    bsc -u -verilog -g mk$f $f.bsv 2>&1 | grep -E "Error:|created"
done
```

---

## Phase 2 — UART

> 发给两个 Agent：

```
实现 UART 异步串口模块。按照 AGENTS.md 的接口规范。

bsv/Uart.bsv — 异步串行收发器

发送：
- 8 位数据，1 停止位，无校验
- 支持可配置波特率
- 发送有缓冲（至少 8 字节深度），写满时外部等待
- 输出 TX 串行信号和发送状态（空闲 / 忙）

接收：
- 8 位数据，1 停止位，无校验
- 接收有缓冲（至少 8 字节深度），新数据到达时通知外部
- 缓冲溢出不丢数据时需指示

状态：
- 外部可查询发送是否空闲、接收是否有新数据
- 外部可配置波特率分频值

模块名 mkUart。独立 package。
```

### WSL 编译

```bash
cd /mnt/d/Desktop/bsv-test/project-periph/A/bsv
bsc -u -verilog -g mkUart Uart.bsv 2>&1 | grep -E "Error:|created"
```

---

## Phase 3 — 总线互连

> 发给两个 Agent：

```
实现总线互连矩阵，连接多个 Master 和多个 Slave。按照 AGENTS.md 的接口规范。

bsv/WbInterconnect.bsv — 多主多从总线互连

要求：
- 3 个 Master 端口（指令、数据、DMA），4 个 Slave 端口（ROM、Timer、GPIO、UART）
- 根据 Master 访问的地址范围选择对应 Slave
- 多个 Master 同时请求时，按优先级仲裁（指令 > 数据 > DMA）
- 每个 Slave 在同一周期只能被一个 Master 访问
- 外部可查询当前哪个 Master 获得了授权

模块名 mkWbInterconnect。独立 package，不依赖 Phase 1/2 已有模块。
```

### WSL 编译

```bash
cd /mnt/d/Desktop/bsv-test/project-periph/A/bsv
bsc -u -verilog -g mkWbInterconnect WbInterconnect.bsv 2>&1 | grep -E "Error:|created"
```

---

## Phase 4 — DMA + 顶层集成

> 发给两个 Agent：

```
实现 DMA 引擎和顶层集成模块。按照 AGENTS.md 的接口规范。

1. bsv/Dma.bsv — 批量数据搬移引擎
   - 可配置源地址、目标地址、搬运长度
   - 启动后自动逐字节从源搬运到目标（通过总线）
   - 搬运完成后通知外部（中断信号）
   - 搬运过程中外部可查询是否忙
   - 模块名 mkDma

2. bsv/Top.bsv — 顶层集成
   - 把之前实现的模块全部例化并连接起来
   - BootROM、Timer、GPIO、UART 接到总线互连的 Slave 端
   - 指令 Master、数据 Master、DMA Master 接到总线互连的 Master 端
   - 输出所有中断信号到顶层

可 import 已有模块的 package。所有文件都在 bsv/ 下。
```

### WSL 编译

```bash
cd /mnt/d/Desktop/bsv-test/project-periph/A/bsv
bsc -u -verilog -g mkDma Dma.bsv 2>&1 | grep -E "Error:|created"
bsc -u -verilog -g mkTop Top.bsv 2>&1 | grep -E "Error:|created"
```
