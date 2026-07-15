// Fixture: checkAttrBadRule (G0054) — fail case
// Urgency annotation references a name that does not exist in the module.

typedef enum { IDLE, BUSY } State deriving (Bits, Eq);

interface IfcBridge;
    method Action chip_done_set;
endinterface

(* descending_urgency = "chip_done_set, does_not_exist, process_frame" *)
(* synthesize *)
module mkBridge(IfcBridge);
    Reg#(State) state <- mkReg(IDLE);

    rule process_frame;
        state <= BUSY;
    endrule

    method Action chip_done_set;
        state <= IDLE;
    endmethod
endmodule
