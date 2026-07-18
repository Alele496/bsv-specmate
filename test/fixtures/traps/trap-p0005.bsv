package TrapP0005;

import Vector::*;

(* synthesize *)
module mkTrapP0005(Empty);
    Vector#(4, Bit#(3)) requests = vec(3'd1, 3'd2, 3'd3, 3'd4);
    // ❌ P0005: function keyword in genWith callback
    Vector#(4, Bool) result = genWith(function(Integer i);
        return requests[i] == 3'd1;
    endfunction);
endmodule

endpackage
