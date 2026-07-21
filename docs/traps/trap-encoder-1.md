# encoder-1: 优先编码器输出位宽 = ceil(log2(input_width))

> 适用 BSC 版本: 2025.07

## 现象

优先编码器（priority encoder）在高位输入有效时输出错误编码结果。例如 9-bit 输入 `9'b1_0000_0000`（最高位有效），3-bit 输出应返回 8（索引 8），但实际返回 0（被截断的低 3 位）。BSC 编译通过，位宽截断发生在值被赋给窄类型时，编译器只做截断不报告。

## 原因

优先编码器输出的是最高有效位的二进制索引。输出位宽必须能覆盖所有可能的索引值：

- 8-bit 输入 → 索引范围 0-7 → 3 位够用（2^3 = 8）
- 9-bit 输入 → 索引范围 0-8 → 需要 4 位（2^3 = 8 < 9，溢出）

位宽计算公式：`output_width = ceil(log2(input_width))`

当 `input_width` 为 9 时，`ceil(log2(9)) = 4`，用 3-bit 输出会导致索引 8 被截断为 0。BSC 编译器在赋 `4'd8` 给 `Bit#(3)` 时自动截断高位，不发出警告。

## 解决方案

按公式计算输出位宽：

```bsv
// 错误 — 9-bit 输入，3-bit 输出不足
method Bit#(3) encode(Bit#(9) in);
    // ceil(log2(9)) = 4, 需要 4 bits
    // 4'd8 → 3'd0 截断
    if (in[8] == 1) return 3'd0;  // BUG: 索引 8 无法表示
endmethod

// 正确 — 输出位宽 = ceil(log2(9)) = 4
method Bit#(4) encode(Bit#(9) in);
    // 4-bit 输出可表示 0-15，覆盖索引 0-8
    if (in[8] == 1) return 4'd8;
endmethod
```

通用位宽计算公式：

```bsv
// 编译期位宽计算（使用 TAdd# 确保类型安全）
typedef TLog#(TAdd#(input_width, 1)) OutputWidth;
// 等价于 ceil(log2(input_width))，因为 TLog#(N) = ceil(log2(N))
```

## 规则

- severity: quality
- phase: design
- bscDetectable: false
- bscVersions: ['2025.07']
