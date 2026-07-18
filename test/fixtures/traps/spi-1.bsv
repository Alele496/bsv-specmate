// Trap spi-1: SPI 命令字 Bit#(8), 移位寄存器匹配
// SPI 通信以字节为基本单位。命令字寄存器、移位寄存器（shift register）、
// 数据缓冲区都应统一用 Bit#(8)，确保位宽匹配。
// 位宽不一致会导致：(1) 数据截断/符号扩展 → T0051 警告；
// (2) spi_busy 在非 8-bit 架构间的协议错误。
//
// 正确做法：所有 SPI 数据路径统一 Bit#(8)。

package TrapSpi1;

interface SpiIFC;
    method Bit#(8) get_rx_data;
    method Bit#(1) get_busy;
endinterface

(* synthesize *)
module mkTrapSpi1(SpiIFC);
    Reg#(Bit#(8)) cmd_reg    <- mkReg(8'h00);  // 命令字 Bit#(8)
    Reg#(Bit#(8)) shift_reg  <- mkReg(8'h00);  // 移位寄存器 Bit#(8)
    Reg#(Bit#(8)) rx_buf     <- mkReg(8'h00);  // 接收缓冲 Bit#(8)
    Reg#(Bit#(1)) busy       <- mkReg(0);
    Reg#(Bit#(3)) bit_cnt    <- mkReg(0);       // 以 bit 为单位计数（0-7）

    rule spi_transfer (busy == 1'd1 && bit_cnt < 7);
        // 左移移位寄存器，LSB 填 0
        shift_reg <= {shift_reg[6:0], 1'd0};
        bit_cnt <= bit_cnt + 1;
    endrule

    rule spi_done (busy == 1'd1 && bit_cnt == 7);
        rx_buf <= shift_reg;  // Bit#(8) ← Bit#(8)，位宽匹配
        busy <= 0;
    endrule

    method Bit#(8) get_rx_data = rx_buf;
    method Bit#(1) get_busy    = busy;
endmodule

endpackage
