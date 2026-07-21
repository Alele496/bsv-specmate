# timer-1: 计数器位宽 = ceil(log2(max_count))

> 适用 BSC 版本: 2025.07

## 现象

Timer 模块的中断在预期时刻之前反复触发。例如配置 1000 周期定时，实际每 256 周期就触发一次中断（如果用了 8-bit 计数器）。BSC 编译通过，无错误警告，功能仿真时表现为异常的周期性"假中断"。

## 原因

计数寄存器位宽必须覆盖最大计数值。如果位宽不足：

- 目标计数值 max_count = 1000，需要 `ceil(log2(1000)) = 10` bits
- 用 `Bit#(8)` 计数器 → 最大值 255
- 计数器在 255 时溢出回卷到 0，不会达到 999
- 如果中断触发器绑定在 `counter == 999`，中断永远不会触发
- 如果错误地绑定在 `counter == 255`（计数器满），则每 256 周期触发一次——远早于预期的 1000 周期

BSC 编译器不检测计数溢出的功能后果。`counter == fromInteger(999)` 对 `Bit#(8)` 计数器来说永远为 False，编译器不会警告。

## 解决方案

计数器位宽 = `ceil(log2(max_count))`：

```bsv
// 错误 — 8-bit 计数器存 1000 的计数范围
Reg#(Bit#(8)) counter <- mkReg(0);   // max: 255, 不足
rule tick;
    // counter == 999 永远为 False
    counter <= (counter == 8'd255) ? 8'd0 : counter + 8'd1;
endrule

// 正确 — ceil(log2(1000)) = 10 bit
Reg#(Bit#(10)) counter <- mkReg(0);  // max: 1023, 覆盖 0-999
rule tick;
    counter <= (counter == 10'd999) ? 10'd0 : counter + 10'd1;
    expired  <= (counter == 10'd999);
endrule
```

位宽速查：

| max_count | 所需位宽 | 位宽寄存器最大 |
|-----------|---------|---------------|
| 100       | 7       | 127           |
| 256       | 8       | 255           |
| 1000      | 10      | 1023          |
| 4096      | 12      | 4095          |
| 10000     | 14      | 16383         |

编译期位宽检查写法：

```bsv
// 用 provisos 确保位宽足够
Integer max_count = 1000;
Integer count_width = valueOf(TLog#(TAdd#(max_count, 1)));
// count_width = 10
```

## 规则

- severity: quality
- phase: design
- bscDetectable: false
- bscVersions: ['2025.07']
