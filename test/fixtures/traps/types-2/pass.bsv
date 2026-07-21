// Correct: explicit width alignment with zeroExtend
package TrapTypes2Pass;

interface TestIFC;
    method Bit#(8) result();
endinterface

(* synthesize *)
module mkTrapTypes2Pass(TestIFC);
    Reg#(Bit#(8)) a <- mkReg(0);
    Reg#(Bit#(4)) b <- mkReg(0);

    rule compute;
        // correct: zeroExtend b to Bit#(8) before addition
        a <= a + zeroExtend(b);
    endrule

    method Bit#(8) result() = a;
endmodule

endpackage
