// Correct: BVI import with both default_clock and default_reset
package TrapBvi1Pass;

interface TestIFC;
    method Bit#(8) out();
    method Bit#(1) out_ready();
endinterface

import "BVI" MyVerilog =
module mkTrapBvi1Pass(TestIFC);
    default_clock clk(CLK);
    default_reset rst(RST_N);
    method out data() DATA;
    method out_ready ready() RDY;
endmodule

endpackage
