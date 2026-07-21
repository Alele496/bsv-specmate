# serialize-1: 串行器移位寄存器位宽对齐

> 适用 BSC 版本: 2025.07

## 现象

串行器（serializer）模块运行时输出数据缺少最高有效位（MSB）。BSC 编译通过，无错误或警告，但仿真波形或硬件验证发现串行数据流丢失 bit 7。

## 原因

串行器使用移位寄存器逐 bit 输出并行数据。移位寄存器位宽如果小于并行数据位宽，加载时高位被截断。例如用 `Bit#(7)` 移位寄存器存储 8-bit 数据：`shift <= data[6:0]` 静默丢弃 `data[7]`。这是纯设计层位宽计算错误，BSC 编译器无法在编译期检测——它只检查类型安全，不检查功能位宽对齐。

## 解决方案

确保移位寄存器位宽等于并行数据位宽：

```bsv
// 错误 — 移位寄存器位宽不匹配
Reg#(Bit#(8)) data  <- mkReg(0);
Reg#(Bit#(7)) shift <- mkReg(0);  // 7-bit 存 8-bit 数据 → MSB 截断
rule do_serialize;
    shift <= {1'b0, data[7:1]};   // data[7] 从未进入 shift
endrule

// 正确 — 移位寄存器位宽与数据位宽一致
Reg#(Bit#(8)) data  <- mkReg(0);
Reg#(Bit#(8)) shift <- mkReg(0);  // bit width == data width
rule do_serialize;
    shift <= {1'b0, shift[7:1]};
endrule
```

初始加载时直接赋值而非位选截断：

```bsv
// 加载时用完整赋值
method Action load(Bit#(8) d);
    data  <= d;
    shift <= d;  // full 8-bit load
    count <= 8;
endmethod
```

## 规则

- severity: quality
- phase: design
- bscDetectable: false
- bscVersions: ['2025.07']
