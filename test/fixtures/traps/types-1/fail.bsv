// Expected error: T0020 — operator type mismatch: ~ on Bool
package TrapTypes1Fail;

interface TestIFC;
    method Bool is_done();
endinterface

(* synthesize *)
module mkTrapTypes1Fail(TestIFC);
    Bool done = True;

    // T0020: ~ (bitwise NOT) expects Bit#(n), not Bool
    Bool done_inv = ~done;
    // Bool done_inv = ~done;

    method Bool is_done() = done_inv;
endmodule

endpackage
