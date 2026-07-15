// Fixture: checkRuleDoubleWrite (G0004) — fail case
// Same register written twice unconditionally in one rule — real G0004 risk.

(* synthesize *)
module mkG0004Fail(Empty);
    Reg#(Bit#(8)) data <- mkReg(0);

    rule doWork;
        data <= 1;
        // Second write to same register — true G0004 conflict
        data <= 2;
    endrule
endmodule
