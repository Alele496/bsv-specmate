// Correct: explicit port mapping default_reset rst(RST)
package TrapReset2Pass;

interface TestIFC;
    method Bit#(8) val();
    method Bit#(1) val_ready();
endinterface

import "BVI" ResetModule =
module mkTrapReset2Pass(TestIFC);
    default_clock clk(CLK);
    default_reset rst(RST);  // explicit port name for RST (not RST_N)
    method val data() DATA;
    method val_ready ready() RDY;
endmodule

endpackage
