// Trap bram-1: BRAM 双端口读写分离
// BSV 提供多层 Block RAM 抽象：
//   BRAM: 双端口（portA + portB），request/response 语义
//   BRAM1Port: 单端口，同一 cycle 只能一个操作

package TrapBram1;

import BRAM::*;

interface BramIFC;
    method Bit#(8) get_read_data;
endinterface

(* synthesize *)
module mkTrapBram1(BramIFC);
    // BRAM1Port 单端口示例——如需双端口用 BRAM#(t,t) + mkBRAM(False)
    let cfg = defaultValue;
    cfg.allowWriteResponseBypass = False;
    BRAM1Port#(Bit#(8), Bit#(8)) bram <- mkBRAM1Server(cfg);

    Reg#(Bit#(8))  addr    <- mkReg(0);
    Reg#(Bit#(8))  data    <- mkReg(0);
    Reg#(Bit#(8))  result  <- mkReg(0);
    Reg#(Bool)     inited  <- mkReg(False);

    rule init_bram (!inited);
        bram.portA.request.put(BRAMRequest{
            write: True, responseOnWrite: False,
            address: addr, datain: data
        });
        addr <= addr + 1;
        data <= data + 1;
        if (addr == 255) inited <= True;
    endrule

    rule read_back (inited);
        bram.portA.request.put(BRAMRequest{
            write: False, responseOnWrite: False,
            address: addr - 1, datain: ?
        });
        let val <- bram.portA.response.get();
        result <= val;
    endrule

    method Bit#(8) get_read_data = result;
endmodule

endpackage
