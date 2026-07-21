// Expected issue: serialize-1 — 串行器移位寄存器位宽不等于并行数据位宽，最高位截断
// 这是设计级陷阱：代码可正常编译，但运行时 8-bit 数据的最高位（bit 7）被截断
package TrapSerialize1Fail;

interface SerialIFC;
    method Bit#(1) serial_out();
    method Action load(Bit#(8) data);
    method Action shift();
endinterface

(* synthesize *)
module mkTrapSerialize1Fail(SerialIFC);
    Reg#(Bit#(8))  data  <- mkReg(0);
    Reg#(Bit#(7))  shift <- mkReg(0);   // BUG: 7-bit shift reg for 8-bit data → MSB lost
    Reg#(Bit#(4))  count <- mkReg(0);

    rule do_serialize (count > 0);
        shift <= {1'b0, shift[6:1]};
        count <= count - 1;
    endrule

    method Bit#(1) serial_out() = shift[0];
    method Action load(Bit#(8) d);
        data  <= d;
        shift <= d[6:0];                // BUG: data[7] silently dropped
        count <= 8;
    endmethod
    method Action shift();
        shift <= {1'b0, shift[6:1]};
        count <= (count == 0) ? 0 : count - 1;
    endmethod
endmodule

endpackage
