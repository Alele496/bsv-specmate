// Expected error: P0032 — method defined before rule
package TrapMethod1Fail;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesize *)
module mkTrapMethod1Fail(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    // P0032: method definition must come after all rules
    method Bit#(8) val() = r;

    rule increment;
        r <= r + 1;
    endrule
endmodule

endpackage
