// Trap uart-1: 波特率分频用 Bit#(n) 而非 Integer
// UART 波特率发生器需要一个分频计数器，将系统时钟降到目标波特率。
// 使用 Integer 类型做分频计数会导致 BSC 无法确定 Verilog 位宽
// （Integer 是无限精度，综合工具需要具体位宽）。
//
// 正确做法：用 Bit#(n) 类型，n = ceil(log2(divisor))。
// 例如：50MHz / 115200bps ≈ 434，需要 Bit#(9)（512 > 434）。

package TrapUart1;

interface UartIFC;
    method Bit#(1) get_tick;
    method Bit#(1) get_tx;
endinterface

(* synthesize *)
module mkTrapUart1(UartIFC);
    // 50MHz / 115200bps ≈ 434 cycles per bit → 需要 Bit#(9)
    Reg#(Bit#(9))  baud_cnt    <- mkReg(0);
    Reg#(Bit#(1))  tick        <- mkReg(0);
    Reg#(Bit#(3))  bit_idx     <- mkReg(0);
    Reg#(Bit#(8))  tx_data     <- mkReg(8'h55);
    Reg#(Bit#(1))  tx          <- mkReg(1'd1);

    // 波特率分频：用 Bit#(9) 计数，达到阈值后产生 tick
    rule baud_generator;
        if (baud_cnt == 433) begin  // 0-433 = 434 cycles
            baud_cnt <= 0;
            tick <= 1'd1;
        end else begin
            baud_cnt <= baud_cnt + 1;
            tick <= 1'd0;
        end
    endrule

    // 常见错误（注释示意）：
    // Integer baud_cnt;  // BSC 无法确定位宽 → 综合可能失败

    method Bit#(1) get_tick = tick;
    method Bit#(1) get_tx   = tx;
endmodule

endpackage
