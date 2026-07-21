// Correct: use replicateM or genWith to construct Vector in BSC 2025.07
package TrapVector1Pass;

import Vector :: *;

interface TestIFC;
    method Bit#(32) port0();
endinterface

(* synthesize *)
module mkTrapVector1Pass(TestIFC);
    // correct: replicateM creates a Vector by replicating the module constructor
    Vector#(4, Reg#(Bit#(32))) regs <- replicateM(mkReg(0));

    // Alternative: genWith for index-dependent initialization
    // Vector#(4, Reg#(Bit#(32))) regs <- genWith(vec, mkReg(0));

    method Bit#(32) port0() = regs[0];
endmodule

endpackage
