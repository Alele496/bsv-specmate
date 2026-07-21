// Correct: 串行器移位寄存器位宽与并行数据位宽一致，均为 8-bit
package TrapSerialize1Pass;

interface SerialIFC;
    method Bit#(1) serial_out();
    method Action load(Bit#(8) data);
    method Action shift();
endinterface

(* synthesize *)
module mkTrapSerialize1Pass(SerialIFC);
    Reg#(Bit#(8))  data  <- mkReg(0);
    Reg#(Bit#(8))  shift <- mkReg(0);   // CORRECT: shift reg matches data width
    Reg#(Bit#(4))  count <- mkReg(0);

    rule do_serialize (count > 0);
        shift <= {1'b0, shift[7:1]};
        count <= count - 1;
    endrule

    method Bit#(1) serial_out() = shift[0];
    method Action load(Bit#(8) d);
        data  <= d;
        shift <= d;                     // CORRECT: full 8-bit data loaded
        count <= 8;
    endmethod
    method Action shift();
        shift <= {1'b0, shift[7:1]};
        count <= (count == 0) ? 0 : count - 1;
    endmethod
endmodule

endpackage
