// Expected error: T0016 — BVI parameter using type variable directly (no valueOf)
package TrapBvi2Fail;

interface TestIFC#(numeric type sz_a);
    method Bit#(sz_a) out();
    method Bit#(1) out_ready();
endinterface

import "BVI" MyModule =
module mkTrapBvi2Fail#(Bit#(sz_a) val) (TestIFC#(sz_a));
    default_clock clk(CLK);
    default_reset rst(RST_N);
    parameter width = sz_a;  // T0016: cannot use type variable directly
    method out data() DATA;
    method out_ready ready() RDY;
endmodule

endpackage
