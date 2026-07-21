# decoder-1: 译码器输出位宽 = 2^input_width

> 适用 BSC 版本: 2025.07

## 现象

译码器（decoder）部分地址无法正确解码。BSC 编译通过，但运行时发现某些输入值对应的 one-hot 输出位永远为 0。例如 3-bit 输入用 6-bit 输出时，地址 6（`3'b110`）和 7（`3'b111`）的对应 bit 不存在于输出向量中。

## 原因

译码器将 N-bit 二进制地址解码为 one-hot 向量。每个输入值对应输出向量的一个 bit，因此输出位宽必须为 2^N：

- 2-bit 输入 → 2^2 = 4 位输出
- 3-bit 输入 → 2^3 = 8 位输出
- 4-bit 输入 → 2^4 = 16 位输出

位宽不足时（如 3-bit 输入配 6-bit 输出），地址 6 和 7 无法映射到输出位，对应路径失效。BSC 编译器只检查类型一致性，不检查位宽是否覆盖所有输入值。

## 解决方案

译码器输出位宽 = 2^input_width，one-hot 用 `Bit#(N)` 方便下游拼接：

```bsv
// 错误 — 3-bit 输入用 6-bit 输出，2^3 = 8 位实际需要
method Bit#(6) decode(Bit#(3) addr);
    Bit#(6) result = 0;
    // 只覆盖 addr 0-5，addr 6,7 无法解码
    for (i = 0; i < 6; i = i + 1)
        if (addr == fromInteger(i)) result[i] = 1;
    return result;
endmethod

// 正确 — 输出位宽 = 2^3 = 8
method Bit#(8) decode(Bit#(3) addr);
    Bit#(8) result = 0;
    // 覆盖所有 8 个地址
    for (i = 0; i < 8; i = i + 1)
        if (addr == fromInteger(i)) result[i] = 1;
    return result;
endmethod
```

更简洁的写法：用移位实现 one-hot 编码

```bsv
method Bit#(8) decode(Bit#(3) addr);
    return 8'd1 << addr;  // 等效于 1 << addr
endmethod
```

## 规则

- severity: quality
- phase: design
- bscDetectable: false
- bscVersions: ['2025.07']
