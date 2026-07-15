# BSV-PORTS — Verilog 端口命名规则 (×1)

> 适用版本: BSC 2025.07 | 自动生成: 2026-07-15 | 来源: 1 captures

**bsc 输出**：Vivado `get_ports uart_rx` 找不到端口。

**原因**：

BSV 的 `method Action` 在合成 Verilog 时：
- 数据端口用**参数名**（不是方法名）
- 额外生成 `EN_<方法名>`（输入使能）、`RDY_<方法名>`（输出就绪）

| BSV 代码 | Verilog 端口 |
|----------|-------------|
| `method Action uart_rx(Bit#(1) val)` | `input val`, `input EN_uart_rx`, `output RDY_uart_rx` |
| `method Bit#(1) uart_tx` | `output uart_tx`, `output RDY_uart_tx` |

**解决**：

创建 Verilog 薄封装文件 `top_wrapper.v`，实例化 BSV 模块：
- 将参数端口连到 XDC 期望的端口名
- `EN_uart_rx` 接 `1'b1`
- RDY 端口悬空（均为常量 1 输出）
- Vivado 以 `top_wrapper` 为顶层

```verilog
module top_wrapper(input CLK, input RST_N, input val, output uart_tx);
    wire EN_uart_rx = 1'b1;
    mkUartRx u_uart(.CLK(CLK), .RST_N(RST_N), .val(val),
                    .EN_uart_rx(EN_uart_rx), .RDY_uart_rx(), .uart_tx(uart_tx));
endmodule
```

> **规则**: BSV Action 方法的 Verilog 端口名 = 参数名，非方法名。带 guard 的方法 EN 需正确驱动。
