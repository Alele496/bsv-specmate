// Correct: urgency references existing rules
package TrapAttribute2Pass;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesize *)
(* descending_urgency = "rl_b, rl_a" *)  // both rules exist
module mkTrapAttribute2Pass(TestIFC);
    Reg#(Bit#(8)) count <- mkReg(0);

    rule rl_a;
        count <= 1;
    endrule

    rule rl_b;
        count <= 2;
    endrule

    method Bit#(8) val() = count;
endmodule

endpackage
