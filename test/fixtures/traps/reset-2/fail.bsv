// Expected: G0124 — default_reset expects Verilog port RST_N, but RTL port is RST
// Note: Requires a Verilog wrapper file. This fixture captures the pattern.
// In practice: default_reset without explicit port mapping expects RST_N.
package TrapReset2Fail;

interface TestIFC;
    method Bit#(8) val();
    method Bit#(1) val_ready();
endinterface

// Without explicit port mapping, default_reset expects RST_N in Verilog
import "BVI" ResetModule =
module mkTrapReset2Fail(TestIFC);
    default_clock clk(CLK);
    default_reset rst;  // expects RST_N, error if Verilog has RST
    method val data() DATA;
    method val_ready ready() RDY;
endmodule

endpackage
