// Correct: single write per register per rule (use conditional expression)
package TrapRule1Pass;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesize *)
module mkTrapRule1Pass(TestIFC);
    Reg#(Bit#(8)) count <- mkReg(0);
    Reg#(Bool) flag <- mkReg(False);

    rule do_work;
        // single write: use ternary to select value
        count <= (flag) ? 1 : 2;
    endrule

    method Bit#(8) val() = count;
endmodule

endpackage
