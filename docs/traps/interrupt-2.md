# interrupt-2: mask 位宽 vs pending 位宽对齐

> 适用 BSC 版本: 2025.07

## 现象

中断控制器中 mask 寄存器和 pending 寄存器的位宽不一致，导致 `mask & pending` 运算产生 T0051 位宽不匹配警告，且高 bit 的 pending 永远无法被 mask 屏蔽。

## 原因

mask 是每个中断线的使能位，pending 记录每个中断线的待处理状态。如果 mask 是 4-bit 而 pending 是 8-bit：
1. `Bit#(4) & Bit#(8)` 触发 T0051 位宽不匹配
2. pending[7:4] 永远无法被 mask 屏蔽，导致漏中断

## 解决方案

mask 和 pending 使用相同位宽 `Bit#(n)`，n = 中断线数量。

```bsv
// 正确 — 位宽对齐
Reg#(Bit#(8)) pending <- mkReg(0);  // 8 条中断线
Reg#(Bit#(8)) mask    <- mkReg(8'hFF);

// Bit#(8) & Bit#(8) → Bit#(8)，运算安全
let active = pending & mask;

// 错误 — 位宽不匹配
// Reg#(Bit#(4)) mask;     // 4-bit
// Reg#(Bit#(8)) pending;  // 8-bit
// let active = pending & mask;  // T0051!
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
