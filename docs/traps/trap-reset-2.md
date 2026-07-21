# reset-2: default_reset 在 BVI 中是 RST_N 而非 RST

> 适用 BSC 版本: 2025.07

## 现象

BVI import 声明中使用 `default_reset` 时，BSC 期望对应的 Verilog port 名为 `RST_N`（低电平有效复位）。如果 RTL 中复位信号名为 `RST`（高电平有效），端口绑定失败触发 G0124。

## 原因

BSC 的 BVI 机制中，`default_reset` 没有显式指定端口名时，默认映射到 Verilog port `RST_N`。许多第三方的 Verilog IP 核使用高电平有效复位，端口名为 `RST` 而非 `RST_N`，导致端口名不匹配。

## 解决方案

使用显式端口映射：`default_reset rst(RST)` 指定 Verilog 端口名。

```bsv
// 错误 — 期望 RST_N
import "BVI" MyModule =
module mkMyModule(MyIFC);
    default_clock clk(CLK);
    default_reset rst;  // 映射到 RST_N
endmodule

// 正确 — 显式指定端口名
import "BVI" MyModule =
module mkMyModule(MyIFC);
    default_clock clk(CLK);
    default_reset rst(RST);  // 映射到 RST
endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: G0124
