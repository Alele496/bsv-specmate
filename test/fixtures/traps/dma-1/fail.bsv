// Expected issue: dma-1 — DMA 描述符链用 Wire 跨 rule 传递，数据仅在当前 cycle 有效
// 这是设计级陷阱：代码可正常编译，但下游 rule 跨 cycle 读取 Wire 时得到过期/不定数据
package TrapDma1Fail;

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
module mkTrapDma1Fail(DmaIFC);
    // BUG: Wire 只在当前 cycle 有效，跨 rule 传递描述符指针会丢失数据
    Wire#(Descriptor) current_desc <- mkWire;

    Reg#(Bit#(16)) byte_count <- mkReg(0);
    Reg#(Bit#(32)) src_addr    <- mkReg(0);
    Reg#(Bit#(32)) dst_addr    <- mkReg(0);

    // producer rule: 设置当前描述符
    rule load_descriptor;
        // current_desc 在此 cycle 写入...
        // 但 consumer rule 下一 cycle 无法读到
    endrule

    // consumer rule: 消费描述符数据 — 读到过期/不定数据
    rule process_transfer;
        // current_desc 已失效！
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
