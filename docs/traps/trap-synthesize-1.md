# synthesize-1: 多态模块不能直接 synthesize

> 适用 BSC 版本: 2025.07

## 现象

给带有类型参数（type parameter）的模块加上 `(* synthesize *)` pragma，触发 T0030：多态模块无法直接综合。

## 原因

BSC 的综合工具要求顶层模块的所有类型参数都在编译时完全确定。多态模块（`module mkX#(...)(Ifc#(t)) provisos (...)）的类型参数 `t` 在实例化前是不确定的，综合工具无法为此生成具体的 Verilog 网表。

## 解决方案

用具体类型的包装模块包裹多态模块：

```bsv
// 错误 — 多态模块直接 synthesize
(* synthesize *)
module mkQueue#(Integer depth)(FIFO#(t)) provisos (Bits#(t, sz_t));
    FIFO#(t) f <- mkSizedFIFO(depth);
    // ...
endmodule

// 正确 — 用具体类型包装
(* synthesize *)
module mkQueue_32(FIFO#(Bit#(32)));
    FIFO#(Bit#(32)) f <- mkSizedFIFO(16);
    // ...
endmodule

// 或使用库中的具体版本
// mkSizedFIFO depth 已内置具体实现，直接 synthesize 即可
(* synthesize *)
module mkSizedFIFO_32(FIFO#(Bit#(32)));
    let f <- mkSizedFIFO(16);
    return f;
endmodule
```

## 规则

- severity: hard
- phase: design
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: T0030
