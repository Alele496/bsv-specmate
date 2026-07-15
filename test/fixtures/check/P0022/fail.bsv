// Fixture: checkP0022AttrOnMethod — fail case
// Module method implementation uses (* always_enabled *) pragma — triggers P0022.

interface IfcUart;
    (* always_enabled *)
    method Action uart_rx_pin(Bit#(1) val);
endinterface

(* synthesize *)
module mkUartFail(IfcUart);
    Reg#(Bit#(1)) val <- mkReg(0);

    // Pragma on module method implementation — INVALID (P0022)
    (* always_enabled *)
    method Action uart_rx_pin(Bit#(1) pin);
        val <= pin;
    endmethod
endmodule
