// Correct: top-level module has (* synthesize *) for Verilog generation
package TrapSynthesize2Pass;

interface TestIFC;
    method Bit#(8) val();
endinterface

// correct: (* synthesize *) ensures bsc generates .v file
(* synthesize *)
module mkTrapSynthesize2Pass(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    rule increment;
        r <= r + 1;
    endrule

    method Bit#(8) val() = r;
endmodule

endpackage
