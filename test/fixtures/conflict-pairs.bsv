package TestConflictPairs;

module mkTestConflictPairs();
  Reg#(Bit#(32)) regA <- mkReg(0);

  rule testRule;
    regA <= 1;
    regA <= 2;
  endrule
endmodule

endpackage
