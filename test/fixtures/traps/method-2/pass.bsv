// Correct: value method using ternary expression
package TrapMethod2Pass;

interface TestIFC;
    method Bit#(1) is_done();
endinterface

(* synthesize *)
module mkTrapMethod2Pass(TestIFC);
    Reg#(Bit#(2)) state <- mkReg(0);

    // correct: ternary expression in value method
    method Bit#(1) is_done = (state == 2'd3) ? 1'd1 : 1'd0;
endmodule

endpackage
