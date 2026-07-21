// Expected error: T0004 — vec() not exported in BSC 2025.07
package TrapVector1Fail;

import Vector :: *;

interface TestIFC;
    method Bit#(32) port0();
endinterface

(* synthesize *)
module mkTrapVector1Fail(TestIFC);
    // T0004: vec() function not available in BSC 2025.07 standard library
    Vector#(4, Reg#(Bit#(32))) regs <- vec(
        mkReg(0), mkReg(0), mkReg(0), mkReg(0)
    );

    method Bit#(32) port0() = regs[0];
endmodule

endpackage
