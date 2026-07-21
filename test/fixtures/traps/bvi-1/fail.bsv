// Expected error: G0124 — BVI import missing default_clock / default_reset
package TrapBvi1Fail;

interface TestIFC;
    method Bit#(8) out();
    method Bit#(1) out_ready();
endinterface

import "BVI" MyVerilog =
module mkTrapBvi1Fail(TestIFC);
    // G0124: Missing default_clock and default_reset
    method out data() DATA;
    method out_ready ready() RDY;
endmodule

endpackage
