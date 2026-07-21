# bvi-1: BVI 缺少 default_clock / default_reset

> 适用 BSC 版本: 2025.07

## 现象

BVI import 声明中缺少 `default_clock` 或 `default_reset` 声明，BSC 触发 G0124，无法确定时钟/复位端口映射。

## 原因

BVI 机制需要显式告诉 BSC 哪个 Verilog port 是时钟、哪个是复位。`default_clock` 和 `default_reset` 声明指定了模块实例化时的隐式时钟/复位映射。缺少这两个声明时，BSC 无法生成正确的 Verilog 实例化代码。

## 解决方案

每个 BVI import 必须同时包含 `default_clock` 和 `default_reset`。

```bsv
// 错误 — 缺少 default_clock 和 default_reset
import "BVI" MyVerilog =
module mkMyVerilog(MyIFC);
    method out data() DATA;  // G0124
endmodule

// 正确
import "BVI" MyVerilog =
module mkMyVerilog(MyIFC);
    default_clock clk(CLK);
    default_reset rst(RST_N);
    method out data() DATA;
endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: G0124
