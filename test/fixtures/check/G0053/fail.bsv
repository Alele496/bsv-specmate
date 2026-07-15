// Fixture: checkG0053 — fail case
// mkReg with module parameters (non-compile-time constants) should be flagged.
// Module parameters are NOT considered static by BSC.

typedef enum { IDLE, BUSY } State deriving (Bits, Eq);

interface IfcParam #(type data_t);
    method Action start;
endinterface

(* synthesize *)
module mkFail #(Bit#(16) divider, State init_state) (IfcParam#(Bit#(16)));
    // Module parameter — NOT a compile-time constant → G0053 risk
    Reg#(Bit#(16)) div_reg <- mkReg(divider);

    // Module parameter enum — NOT a compile-time constant → G0053 risk
    // Note: init_state starts lowercase, not an enum constructor literal
    Reg#(State) state <- mkReg(init_state);
endmodule
