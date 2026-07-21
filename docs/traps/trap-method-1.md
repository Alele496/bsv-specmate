# method-1: method 必须在所有 rule 之后

> 适用 BSC 版本: 2025.07

## 现象

BSV module 中 method 定义块出现在 rule 之前或之间，触发 P0032。

## 原因

BSV module 有严格的语法结构顺序要求：子模块实例化 → rule 定义 → interface method 定义。method 块必须在所有 rule 之后。这是 BSC parser 的硬性语法约束，不是语义层面的限制。

## 解决方案

确保所有 method 定义都在所有 rule 定义之后。

```bsv
// 错误 — method 在 rule 之前
module mkMod(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);
    method Bit#(8) val() = r;  // P0032
    rule increment;
        r <= r + 1;
    endrule
endmodule

// 正确 — method 在所有 rule 之后
module mkMod(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);
    rule increment;
        r <= r + 1;
    endrule
    method Bit#(8) val() = r;  // correct
endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: P0032
