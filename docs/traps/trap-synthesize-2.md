# synthesize-2: 顶层模块必须加 (* synthesize *)

> 适用 BSC 版本: 2025.07

## 现象

BSC 编译通过（无错误输出），但对于顶层模块不生成 `.v` 文件。`bsc -verilog` 静默完成但输出目录中没有 Verilog 文件。

## 原因

BSC 编译器需要显式标记哪些模块需要综合为 Verilog。没有 `(* synthesize *)` pragma 的模块只会生成 `.bo`（Bluesim 对象）文件，不生成 Verilog 输出。这是 BSC 的设计选择——不是所有模块都需要 Verilog 输出（例如仅用于仿真的 testbench 模块）。

这是静默失败——BSC 不会报错或警告，导致开发者浪费时间排查。

## 解决方案

在需要综合为 Verilog 的顶层模块上添加 `(* synthesize *)` pragma：

```bsv
// 错误 — 无 synthesize，bsc 静默不生成 .v
module mkMyTop(Empty);
    // ... 模块实现
endmodule

// 正确 — 添加 synthesize pragma
(* synthesize *)
module mkMyTop(Empty);
    // ... 模块实现
endmodule
```

编译命令：
```bash
bsc -verilog -show-schedule -aggressive-conditions MyTop.bsv
```

验证 `.v` 文件已生成：
```bash
ls mkMyTop.v  # 应存在
```

## 规则

- severity: hard
- phase: code
- bscDetectable: false
- bscVersions: ['2025.07']
