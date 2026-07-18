# trap-pulsewire-reg — PulseWire + Reg 跨 rule 传数据丢首字节

> 一句话：PulseWire 仅存活一个 cycle，搭配 Reg（下一 cycle 才可见）导致首个数据字节丢失。
> 严重度：quality | bsc感知：不报错 | 阶段：code

## 为什么这是陷阱

PulseWire 的设计用途是**事件通知**（单 cycle 脉冲），不是**数据传输**。它的值在当前 cycle 写入后，下一个 cycle 就清零了。

当用 PulseWire 写入数据、用 Reg 在下一条 rule 中读取时：
1. Cycle N：Rule A 写 PulseWire = data_byte_0
2. Cycle N+1：Rule B 读 Reg（但 Reg 在 Cycle N 写入 PulseWire 的下一个上升沿才锁存）
3. **data_byte_0 丢了**——因为 PulseWire 在 Cycle N+1 已经清零，Reg 连零都锁存不到

Agent 的过时教程中常见 PulseWire + Reg 组合用于 UART/SPI 等串行协议的数据传递，但这是从根本上错误的设计模式。

## 错误表现

### 编译通过但行为错误

- 仿真/上板后首个数据字节丢失
- 串行协议（UART/SPI）的起始字节丢失，表现为通信协议错位
- 数据随机丢失（取决于 rule 调度顺序）

## 正确模式

```bsv
// ❌ 错误写法：PulseWire + Reg 跨 rule 传数据
PulseWire Bit#(8) data_pw <- mkPulseWire;
Reg#(Bit#(8)) data_reg <- mkRegU;

rule receive_data;
    Bit#(8) byte = uart_rx.get();
    data_pw.send(byte);           // data_pw 只有当前 cycle 有效
endrule

rule process_data;
    data_reg <= data_pw;          // data_pw 此时可能已经是 0
    let val = data_reg;           // 读到的可能是旧值或 0
endrule

// ✅ 正确写法 1：用 FIFO 传递数据（推荐）
FIFO#(Bit#(8)) data_fifo <- mkFIFO;

rule receive_data;
    Bit#(8) byte = uart_rx.get();
    data_fifo.enq(byte);          // FIFO 自动处理同步和缓冲
endrule

rule process_data;
    let byte = data_fifo.first();
    data_fifo.deq();
endrule

// ✅ 正确写法 2：用 Wire + 同周期消费（仅限于同 cycle 数据通路）
Wire#(Bit#(8)) data_w <- mkWire;

rule receive_and_process;
    Bit#(8) byte = uart_rx.get();
    data_w <= byte;
    // ... 同一条 rule 内消费 data_w
endrule

// ✅ 正确写法 3：用 EHR（Ephemeral History Register）
EHR#(2, Bit#(8)) ehr <- mkEHR(0);
// rule A 写 port 0, rule B 读 port 1
```

## BSC 参考

- BSC Libraries Reference §mkPulseWire
- BSC Libraries Reference §mkFIFO

## 实际案例

Bench 实验 UART/SPI 任务中，Agent 使用过时教程中的 PulseWire + Reg 组合实现串行数据的 byte 级传递。UART 接收到的第一个字节总是 0x00（PulseWire 已过期），导致通信协议解析失败。改用一个元素的 FIFO 后问题立即解决。

## 关联陷阱

- trap-g0004 — G0004: 单 rule 内多子模块 Action 方法调用（跨 rule 拆分时涉及这个陷阱）
