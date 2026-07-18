package TrapVecConstruction;

import Vector::*;

(* synthesize *)
module mkTrapVecConstruction(Empty);
    // T0004: vec() not exported in BSC 2025.07
    Reg#(Bit#(32)) regs_arr[4];
    // Directly use vec() function — should trigger unbound variable
    Vector#(4, Bit#(32)) vals = vec(32'd1, 32'd2, 32'd3, 32'd4);
endmodule

endpackage
