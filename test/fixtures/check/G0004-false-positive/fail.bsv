// Fixture: G0004 true positive — same register written twice unconditionally
// Two <= writes to the same register in the same rule, NOT in mutually exclusive
// case branches. This IS a real G0004 scheduling conflict.

(* synthesize *)
module mkG0004FalsePositiveFail(Empty);
    Reg#(Bit#(8)) data <- mkReg(0);

    rule doWork;
        data <= 1;
        // Second write to same register — true G0004 conflict
        data <= 2;
    endrule
endmodule
