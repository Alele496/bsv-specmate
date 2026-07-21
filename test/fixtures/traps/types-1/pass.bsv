// Correct: use ! (logical NOT) for Bool values
package TrapTypes1Pass;

interface TestIFC;
    method Bool is_done();
endinterface

(* synthesize *)
module mkTrapTypes1Pass(TestIFC);
    Bool done = True;

    // correct: ! is the logical NOT operator for Bool
    Bool done_inv = !done;

    method Bool is_done() = done_inv;
endmodule

endpackage
