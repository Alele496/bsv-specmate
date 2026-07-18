# crc-2: Bool vs Bit#(1) — done/error 等硬件控制信号用 Bit#(1)

> 适用 BSC 版本: 2025.07

## 现象

CRC 模块的 done、error、valid 等硬件控制信号如果用 Bool 类型，虽然在模块内部编译通过，但：
1. Interface method 返回 Bool 无法拼入 status bus
2. 下游模块从 Bus 提取控制信号时无法直接操作 Bool 类型
3. 与标准库 interface（全部用 Bit#(1)）不一致

## 原因

BSV 类型系统允许在模块内部使用 Bool，BSC 2025.07 已能在 interface method 中捕获 Bool/Bit#(1) 混用（T0061、T0020）。但内部寄存器声明为 Bool 会在 interface 侧产生级联问题——一旦 method 被迫返回 Bool，下游集成就受限。

## 解决方案

硬件控制信号一律用 Bit#(1)，仅纯逻辑判断中间变量用 Bool。

```bsv
// 正确 — 硬件控制信号用 Bit#(1)
Reg#(Bit#(1)) done <- mkReg(0);

method Bit#(1) get_done = done;  // 可直接拼入 status bus

// 错误 — 控制信号用 Bool
// Reg#(Bool) done <- mkReg(False);
// method Bool get_done = done;  // 无法拼入 status bus
```

## 规则

- severity: quality
- phase: code
- bscDetectable: true (bsc 2025.07 在 interface 侧捕获)
- bscVersions: ['2025.07']
