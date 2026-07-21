// Expected error: G0002 — mkRegFile read port count exceeds maxReadPorts (5)
package TrapRegfile1Fail;

import RegFile :: *;

interface TestIFC;
    method Bit#(32) read_port0();
    method Bit#(32) read_port1();
    method Bit#(32) read_port2();
    method Bit#(32) read_port3();
    method Bit#(32) read_port4();
    method Bit#(32) read_port5();
    method Action write_val(Bit#(5) addr, Bit#(32) val);
endinterface

(* synthesize *)
module mkTrapRegfile1Fail(TestIFC);
    // G0002: maxReadPorts exceeding — RegFile limited to 5 read ports
    RegFile#(Bit#(5), Bit#(32)) rf <- mkRegFile(0, 31);

    method Bit#(32) read_port0() = rf.sub(0);
    method Bit#(32) read_port1() = rf.sub(1);
    method Bit#(32) read_port2() = rf.sub(2);
    method Bit#(32) read_port3() = rf.sub(3);
    method Bit#(32) read_port4() = rf.sub(4);
    method Bit#(32) read_port5() = rf.sub(5);  // G0002: 6th read port exceeds limit

    method Action write_val(Bit#(5) addr, Bit#(32) val);
        rf.upd(addr, val);
    endmethod
endmodule

endpackage
