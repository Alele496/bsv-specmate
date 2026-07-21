# bvi-2: BVI parameter 必须用 valueOf() 包装类型变量

> 适用 BSC 版本: 2025.07

## 现象

BVI import 中 interface parameter 的类型变量（如 `sz_a`）直接用作 Verilog parameter，触发 T0016 类型推导失败。

## 原因

BVI 的 `parameter` 声明用于将 BSV 类型层面的参数映射为 Verilog parameter。但 BSV 类型变量（`numeric type`）是编译期抽象，不能直接映射为 Verilog 的 `parameter` 值。必须用 `valueOf()` 函数将类型变量转换为数值表达式。

## 解决方案

对每个类型变量使用 `valueOf()` 包装：`parameter width = valueOf(sz_a);`

```bsv
// 错误 — 直接用类型变量
import "BVI" MyModule =
module mkMyModule#(Bit#(sz_a) val) (MyIFC#(sz_a));
    default_clock clk(CLK);
    default_reset rst(RST_N);
    parameter width = sz_a;  // T0016
endmodule

// 正确 — 用 valueOf()
import "BVI" MyModule =
module mkMyModule#(Bit#(sz_a) val) (MyIFC#(sz_a));
    default_clock clk(CLK);
    default_reset rst(RST_N);
    parameter width = valueOf(sz_a);  // correct
endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: T0016
