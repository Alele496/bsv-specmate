package TestCrossRule;

module mkTestCrossRule();
  Reg#(Bit#(32)) regA <- mkReg(0);

  rule rule1;
    regA <= 1;
  endrule

  rule rule2;
    regA <= 2;
  endrule
endmodule

endpackage
