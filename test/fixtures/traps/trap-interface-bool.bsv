package TrapInterfaceBool;

// Semantic trap demonstration: interface method returning Bool
// bsc does NOT report errors — compiles fine for single module
// Problem appears during integration: Bool can't be bit-concatenated into status bus

interface WrongIFC;
    method Bool tx_done();     // ❌ Bool in interface — compiles but integration problem
    method Bool rx_valid();
endinterface

interface CorrectIFC;
    method Bit#(1) tx_done();  // ✅ Bit#(1) — standard practice
    method Bit#(1) rx_valid();
endinterface

module mkWrong(WrongIFC);
    Reg#(Bool) done <- mkReg(False);
    method Bool tx_done = done;
    method Bool rx_valid = !done;
endmodule

module mkCorrect(CorrectIFC);
    Reg#(Bit#(1)) done <- mkReg(0);
    method Bit#(1) tx_done = done;
    method Bit#(1) rx_valid = ~done;
endmodule

(* synthesize *)
module mkTrapInterfaceBool(Empty);
    WrongIFC bad <- mkWrong;
    CorrectIFC good <- mkCorrect;

    Reg#(Bit#(8)) status <- mkReg(0);
    rule collect;
        // Can't do: {bad.tx_done, bad.rx_valid} — T0061: Bool in bit concatenation
        status <= {7'd0, good.tx_done()};  // Bit#(1) works fine in concatenation
    endrule
endmodule

endpackage
