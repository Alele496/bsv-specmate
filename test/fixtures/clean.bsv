package TestClean;

module mkTestClean();
  Reg#(Bit#(32)) regA <- mkReg(0);
  Reg#(Bit#(32)) regB <- mkReg(0);

  rule rule1;
    regA <= 1;
  endrule

  rule rule2;
    regB <= 2;
  endrule
endmodule

endpackage
