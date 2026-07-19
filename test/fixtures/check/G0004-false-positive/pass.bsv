// Fixture: G0004 false positive — case(reg) FSM pattern
// The case discriminator variable IS the register being assigned in all branches.
// Each branch is mutually exclusive → BSC handles this correctly. NOT a G0004.
// This is the recommended BSV FSM coding pattern.

typedef enum { IDLE, WORK, DONE } State deriving (Bits, Eq);

(* synthesize *)
module mkG0004FalsePositivePass(Empty);
    Reg#(State) state <- mkReg(IDLE);

    rule test_fsm (True);
        case (state)
            IDLE:  state <= WORK;
            WORK:  state <= DONE;
            DONE:  state <= IDLE;
        endcase
    endrule
endmodule
