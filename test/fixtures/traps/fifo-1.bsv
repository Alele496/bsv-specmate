import FIFO::*;

(* synthesize *)
module mkFifo1Test(Empty);
    // mkFIFO1: 1-element FIFO allows same-cycle enq/deq (bypass behavior)
    FIFO#(Bit#(32)) fifo <- mkFIFO1;
    Reg#(Bit#(32)) count <- mkReg(0);

    rule produce (count < 10);
        fifo.enq(count);
        count <= count + 1;
    endrule

    rule consume;
        let val = fifo.first;
        fifo.deq;
        $display("%d", val);
    endrule
endmodule
