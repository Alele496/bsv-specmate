// Correct: method defined after all rules
package TrapMethod1Pass;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesize *)
module mkTrapMethod1Pass(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    rule increment;
        r <= r + 1;
    endrule

    // correct: method after all rules
    method Bit#(8) val() = r;
endmodule

endpackage
