// Correct: properly spelled "synthesize"
package TrapAttribute1Pass;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesize *)  // correct spelling
module mkTrapAttribute1Pass(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    method Bit#(8) val() = r;
endmodule

endpackage
