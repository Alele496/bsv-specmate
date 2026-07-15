// Fixture: checkAttrBadRule (G0054) — pass case
// Urgency annotation references method names that exist in the module.

typedef enum { IDLE, BUSY, DONE } State deriving (Bits, Eq);

interface IfcBridge;
    method Action chip_done_set;
    method Action ldo_ack;
    method Action dac_ack;
endinterface

(* descending_urgency = "chip_done_set, ldo_ack, dac_ack, process_frame, tx_shift" *)
(* synthesize *)
module mkBridge(IfcBridge);
    Reg#(State) state <- mkReg(IDLE);
    Reg#(Bit#(1)) ldo_flag <- mkReg(0);

    rule process_frame;
        ldo_flag <= 1;
    endrule

    rule tx_shift;
        ldo_flag <= 0;
    endrule

    method Action chip_done_set;
        state <= IDLE;
    endmethod

    method Action ldo_ack;
        ldo_flag <= 0;
    endmethod

    method Action dac_ack;
        state <= BUSY;
    endmethod
endmodule
