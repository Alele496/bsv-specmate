// Expected issue: timer-1 — 计数器位宽不足，计数溢出回卷导致错误中断时机
// 这是设计级陷阱：代码可正常编译，但 8-bit 计数器在 255 时溢出回卷到 0
// ceil(log2(1000)) = 10 bits needed, only 8 provided → 每 256 周期误触发一次
package TrapTimer1Fail;

interface TimerIFC;
    method Bool expired();
    method Action start();
    method Action reset();
endinterface

(* synthesize *)
module mkTrapTimer1Fail(TimerIFC);
    // BUG: max count 999 needs ceil(log2(1000)) = 10 bits, only 8 provided
    Reg#(Bit#(8))  counter <- mkReg(0);     // 8-bit max: 255
    Reg#(Bool)     running <- mkReg(False);
    Reg#(Bool)     expired_reg <- mkReg(False);

    rule tick (running);
        // counter 在 255 时溢出回卷到 0，产生错误的中断时机
        counter <= (counter == 8'd255) ? 8'd0 : counter + 8'd1;
        // expired 应该在 999 时触发，但 counter 最大仅 255 → 提前 744 周期
        expired_reg <= (counter == 8'd255);
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
