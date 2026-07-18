# gpio-2: GPIO inout 信号通过 BVI 机制处理

> 适用 BSC 版本: 2025.07

## 现象

BSV 没有内置的 inout 端口类型。尝试在 BSV interface 中定义 inout 方向会编译失败。

## 原因

GPIO 双向信号在硬件中是单一的 inout 线，但在 BSV 中必须拆分为三个独立信号：
- data_in: 从 GPIO 读取
- data_out: 写 GPIO
- oe: output enable（1=输出模式，0=输入模式）

BVI (Bluespec Verilog Import) 机制允许 BSV 模块与 Verilog 包装器对接，由 Verilog 侧的 `assign io = oe ? data_out : 'bz` 实现三态控制。

`Inout#()` 包装器属于旧版 BSC 库用法，BSC 2025.07 中不推荐直接使用。

## 解决方案

BSV interface 定义三个独立 method，通过 BVI import 对接 Verilog wrapper。

```bsv
// BSV interface — 三个独立信号
interface GpioIFC;
    method Bit#(1) io_data_in;
    method Bit#(1) io_data_out;
    method Bit#(1) io_oe;
endinterface

// Verilog wrapper（gpio_wrapper.v）
// module gpio_wrapper(input clk, input rst_n,
//     inout io,
//     input io_data_out, input io_oe, output io_data_in);
//   assign io = io_oe ? io_data_out : 1'bz;
//   assign io_data_in = io;
// endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true (interface 语法层面)
- bscVersions: ['2025.07']
