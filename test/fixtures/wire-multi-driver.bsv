package TestWireConflict;

module mkTestWireConflict();
  Wire#(Bit#(32)) wA <- mkWire();

  rule rule1;
    wA <= 1;
  endrule

  rule rule2;
    wA <= 2;
  endrule
endmodule

endpackage
