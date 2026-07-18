package TrapBoolVsBit;

// Semantic trap test: ~ on Bool — does bsc catch it?

(* synthesize *)
module mkTrapBoolVsBit(Empty);
    Bool b = True;
    Bit#(1) f2 = ~b;  // bitwise NOT on Bool — does this compile?

    Reg#(Bit#(1)) out <- mkReg(0);
    rule tick;
        out <= f2;
    endrule
endmodule

endpackage
