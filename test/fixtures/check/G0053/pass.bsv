// Fixture: checkG0053 — pass case
// mkReg with enum constructors (uppercase identifiers) should NOT be flagged.
// Enum constructors like IDLE, ACTIVE are compile-time constants.

typedef enum { IDLE, ACTIVE, DONE } State deriving (Bits, Eq);

(* synthesize *)
module mkPass(Empty);
    // Enum constructor — valid, compile-time constant
    Reg#(State) state <- mkReg(IDLE);

    // Boolean literals — valid
    Reg#(Bool) flag <- mkReg(True);
    Reg#(Bool) flag2 <- mkReg(False);

    // Numeric literals — valid
    Reg#(Bit#(8)) counter <- mkReg(0);

    // maxBound — valid
    Reg#(Bit#(8)) maxval <- mkReg(maxBound);
endmodule
