// Correct: import Reset :: * before using Reset type
package TrapReset1Pass;

import Reset :: *;

interface TestIFC;
    method Bit#(1) is_reset();
endinterface

(* synthesize *)
module mkTrapReset1Pass(TestIFC);
    Reset rst <- exposeCurrentReset;

    method Bit#(1) is_reset = pack(rst);
endmodule

endpackage
