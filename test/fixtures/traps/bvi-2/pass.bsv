// Correct: BVI parameter uses valueOf() to convert type variable
package TrapBvi2Pass;

interface TestIFC#(numeric type sz_a);
    method Bit#(sz_a) out();
    method Bit#(1) out_ready();
endinterface

import "BVI" MyModule =
module mkTrapBvi2Pass#(Bit#(sz_a) val) (TestIFC#(sz_a));
    default_clock clk(CLK);
    default_reset rst(RST_N);
    parameter width = valueOf(sz_a);  // correct: valueOf() wrapping
    method out data() DATA;
    method out_ready ready() RDY;
endmodule

endpackage
