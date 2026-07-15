// Fixture: checkRuleDoubleWrite (G0004) — pass case
// Single writes per register in the rule — no duplicate writes.

(* synthesize *)
module mkG0004Pass(Empty);
    Reg#(Bit#(8)) data <- mkReg(0);
    Reg#(Bit#(1)) ready <- mkReg(0);

    rule doWork;
        data <= data + 1;
        ready <= 1;
    endrule
endmodule
