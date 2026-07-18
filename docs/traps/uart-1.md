# uart-1: 波特率分频用 Bit#(n) 而非 Integer

> 适用 BSC 版本: 2025.07

## 现象

UART 波特率发生器中使用 Integer 类型做分频计数，综合工具无法确定位宽，可能导致综合失败或生成不理想的硬件。

## 原因

Integer 是 BSV 中的无限精度类型——它不对应任何固定位宽的硬件寄存器。综合工具需要具体位宽来映射到硬件资源。将 Integer 用于计数器是一个常见的坑：Agent 的训练数据中有大量 Integer 计数器的例子，但在 BSV 中它们无法确定性地综合。

## 解决方案

用 `Bit#(n)` 类型，`n = ceil(log2(divisor))`。

例如：50MHz / 115200bps = 434 cycles per bit，需要 434 个状态（0-433），`ceil(log2(434)) = 9`，所以用 `Bit#(9)`。

```bsv
// 正确 — Bit#(9) 分频计数器
Reg#(Bit#(9)) baud_cnt <- mkReg(0);

rule baud_generator;
    if (baud_cnt == 433) begin
        baud_cnt <= 0;
        tick <= 1'd1;
    end else begin
        baud_cnt <= baud_cnt + 1;
        tick <= 1'd0;
    end
endrule

// 错误 — Integer 分频计数器
// Integer baud_cnt;  // 综合工具无法确定位宽
// baud_cnt = baud_cnt + 1;
```

## 规则

- severity: quality
- phase: design
- bscDetectable: false (编译可能通过但综合失败)
- bscVersions: ['2025.07']
