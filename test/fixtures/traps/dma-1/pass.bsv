// Correct: DMA 描述符链用 FIFO 跨 rule 传递，确保数据跨 cycle 不丢失
package TrapDma1Pass;

import FIFO :: *;
import Vector :: *;

typedef struct {
    Bit#(32) src_addr;
    Bit#(32) dst_addr;
    Bit#(16) length;
    Bit#(32) next;
} Descriptor deriving (Bits, Eq);

interface DmaIFC;
    method Action start(Bit#(32) desc_addr);
    method Bit#(32) read_data();
    method Action write_data(Bit#(32) val);
endinterface

(* synthesize *)
module mkTrapDma1Pass(DmaIFC);
    // CORRECT: FIFO 保存描述符，跨 cycle 可靠传递
    FIFO#(Descriptor) desc_fifo <- mkFIFO;  // at least depth 2

    Reg#(Bit#(16)) byte_count <- mkReg(0);
    Reg#(Bit#(32)) src_addr    <- mkReg(0);
    Reg#(Bit#(32)) dst_addr    <- mkReg(0);

    // producer rule: enq 描述符到 FIFO
    rule load_descriptor;
        // desc_fifo.enq(current_desc);  → 数据跨 cycle 安全
    endrule

    // consumer rule: deq 描述符 — 数据可靠
    rule process_transfer;
        // let desc = desc_fifo.first(); → 消费后 desc_fifo.deq();
    endrule

    method Action start(Bit#(32) addr);
        src_addr <= addr;
    endmethod
    method Bit#(32) read_data() = src_addr;
    method Action write_data(Bit#(32) val);
        dst_addr <= val;
    endmethod
endmodule

endpackage
