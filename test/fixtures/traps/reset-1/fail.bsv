// Expected error: T0051 — Reset type used without import Reset :: *
package TrapReset1Fail;

// Missing: import Reset :: *

interface TestIFC;
    method Bit#(1) is_reset();
endinterface

(* synthesize *)
module mkTrapReset1Fail(TestIFC);
    // T0051: Reset type is undefined — missing import Reset :: *
    Reset rst <- exposeCurrentReset;

    method Bit#(1) is_reset = pack(rst);
endmodule

endpackage
