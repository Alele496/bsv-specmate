// Expected: silent failure — bsc compiles without error but does NOT generate .v file
// Module is missing (* synthesize *) pragma — bsc will not generate Verilog output
package TrapSynthesize2Fail;

interface TestIFC;
    method Bit#(8) val();
endinterface

// Missing: (* synthesize *) — bsc compiles to .bo only, no .v generated
module mkTrapSynthesize2Fail(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    rule increment;
        r <= r + 1;
    endrule

    method Bit#(8) val() = r;
endmodule

endpackage
