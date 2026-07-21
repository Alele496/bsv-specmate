// Expected error: T0060 — bit-width mismatch in expression
package TrapTypes2Fail;

interface TestIFC;
    method Bit#(8) result();
endinterface

(* synthesize *)
module mkTrapTypes2Fail(TestIFC);
    Reg#(Bit#(8)) a <- mkReg(0);
    Reg#(Bit#(4)) b <- mkReg(0);

    rule compute;
        // T0060: Bit#(8) + Bit#(4) → type mismatch — operand widths differ
        // Must use extend/truncate/zeroExtend/signExtend for width alignment
        a <= a + b;
    endrule

    method Bit#(8) result() = a;
endmodule

endpackage
