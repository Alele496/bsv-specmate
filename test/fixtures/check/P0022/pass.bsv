// Fixture: checkP0022AttrOnMethod — pass case
// Interface method uses pragma form (valid), module method uses suffix form (valid).

interface IfcUart;
    // Pragma on interface method declaration — valid
    (* always_enabled *)
    method Action uart_rx_pin(Bit#(1) val);
    (* always_ready *)
    method Bit#(8) rx_data;
endinterface

(* synthesize *)
module mkUartPass(IfcUart);
    Reg#(Bit#(8)) data <- mkReg(0);

    // Suffix on module method implementation — valid
    method Action uart_rx_pin(Bit#(1) val) always_enabled;
        data <= data;
    endmethod

    method Bit#(8) rx_data always_ready = data;
endmodule
