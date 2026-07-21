// Correct: 计数器位宽 = ceil(log2(max_count)) = ceil(log2(1000)) = 10
// 10-bit 计数器最大值为 1023，覆盖 0-999 的计数范围
package TrapTimer1Pass;

interface TimerIFC;
    method Bool expired();
    method Action start();
    method Action reset();
endinterface

(* synthesize *)
module mkTrapTimer1Pass(TimerIFC);
    // CORRECT: 10-bit counter covers max count 999 (2^10 = 1024)
    Reg#(Bit#(10)) counter <- mkReg(0);     // 10-bit max: 1023 > 999
    Reg#(Bool)     running <- mkReg(False);
    Reg#(Bool)     expired_reg <- mkReg(False);

    rule tick (running);
        // correct: counter wraps at 999, not prematurely at 255
        counter <= (counter == 10'd999) ? 10'd0 : counter + 10'd1;
        expired_reg <= (counter == 10'd999);
    endrule

    method Bool expired() = expired_reg;
    method Action start();
        running <= True;
    endmethod
    method Action reset();
        counter <= 0;
        running <= False;
        expired_reg <= False;
    endmethod
endmodule

endpackage
