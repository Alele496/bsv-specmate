// Expected error: P0085 — misspelled "synthesized" (should be "synthesize")
package TrapAttribute1Fail;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesized *)  // P0085: unrecognized attribute, should be "synthesize"
module mkTrapAttribute1Fail(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    method Bit#(8) val() = r;
endmodule

endpackage
