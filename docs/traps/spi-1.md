# spi-1: SPI 命令字 Bit#(8), 移位寄存器匹配

> 适用 BSC 版本: 2025.07

## 现象

SPI 模块中命令字寄存器、移位寄存器、数据缓冲区使用不同位宽，导致数据截断、位宽不匹配警告（T0051），或在非 8-bit 架构间的协议错误。

## 原因

SPI 通信以字节（8-bit）为基本单位。所有数据路径组件必须统一为 Bit#(8)：
- 命令字寄存器：Bit#(8)
- 移位寄存器：Bit#(8)
- 接收/发送缓冲：Bit#(8)
- 位计数器：Bit#(3)（0-7 计数）

位宽不一致时，数据在移位、缓冲、拼接过程中会产生截断/零扩展，破坏协议帧格式。

## 解决方案

SPI 数据路径统一使用 Bit#(8)。

```bsv
// 正确 — 统一 Bit#(8)
Reg#(Bit#(8)) cmd_reg   <- mkReg(8'h00);
Reg#(Bit#(8)) shift_reg <- mkReg(8'h00);
Reg#(Bit#(8)) rx_buf    <- mkReg(8'h00);
Reg#(Bit#(3)) bit_cnt   <- mkReg(0);

rule spi_shift (busy == 1'd1 && bit_cnt < 7);
    shift_reg <= {shift_reg[6:0], 1'd0};  // Bit#(8) ← Bit#(8)
    bit_cnt <= bit_cnt + 1;
endrule

// 错误 — 位宽不一致
// Reg#(Bit#(16)) shift_reg;  // 16-bit 移位寄存器
// Reg#(Bit#(8))  rx_buf;
// rx_buf <= shift_reg;  // Bit#(8) ← Bit#(16) → T0051
```

## 规则

- severity: quality
- phase: design
- bscDetectable: true (位宽不匹配时 T0051)
- bscVersions: ['2025.07']
