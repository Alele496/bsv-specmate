# types-2: Bit#(n) 位宽一致性

> 适用 BSC 版本: 2025.07

## 现象

表达式中操作数位宽不匹配（如 `Bit#(8) + Bit#(4)`）触发 T0060 类型推导失败错误。

## 原因

BSV 编译器要求算术和逻辑表达式的操作数位宽必须匹配。不同位宽的操作数不能自动扩展或截断，编译器报 T0060 类型不匹配。这与 Verilog 的隐式扩展行为不同——Verilog 会自动将窄位宽操作数扩展为宽位宽。

## 解决方案

在表达式中显式对齐位宽：

```bsv
// 错误 — 位宽不匹配
Reg#(Bit#(8)) a <- mkReg(0);
Reg#(Bit#(4)) b <- mkReg(0);

rule compute;
    a <= a + b;  // T0060: Bit#(8) + Bit#(4) 不匹配
endrule

// 正确 — zeroExtend 对齐位宽
rule compute;
    a <= a + zeroExtend(b);  // Bit#(8) + Bit#(8)
endrule

// 正确 — 赋值时截断
rule compute;
    b <= truncate(a + 1);  // 截断为 Bit#(4)
endrule

// 正确 — signExtend 用于有符号扩展
Int#(8) c <- mkReg(0);
Int#(4) d <- mkReg(0);
rule compute_signed;
    c <= c + signExtend(d);  // Int#(8) + Int#(8)
endrule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: T0060
