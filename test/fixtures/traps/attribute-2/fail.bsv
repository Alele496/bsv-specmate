// Expected error: G0054 — urgency references non-existent rule rl_a
package TrapAttribute2Fail;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesize *)
(* descending_urgency = "rl_b, rl_a" *)  // G0054: rl_a does not exist
module mkTrapAttribute2Fail(TestIFC);
    Reg#(Bit#(8)) count <- mkReg(0);

    rule rl_b;
        count <= 2;
    endrule

    method Bit#(8) val() = count;
endmodule

endpackage
