// Expected error: P0030 — value method using if-return instead of = expression
package TrapMethod2Fail;

interface TestIFC;
    method Bit#(1) is_done();
endinterface

(* synthesize *)
module mkTrapMethod2Fail(TestIFC);
    Reg#(Bit#(2)) state <- mkReg(0);

    // P0030: value method with = followed by if-return is invalid
    method Bit#(1) is_done = if (state == 2'd3) return 1'd1; else return 1'd0;
endmodule

endpackage
