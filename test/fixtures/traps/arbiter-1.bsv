// Trap arbiter-1: 同一 cycle 超 5 读端口 → G0002
// BSC 的规则分析器限制：单个 Register 模块最多支持 5 个读端口。
// 当一条 rule 在同一 cycle 内通过方法调用访问同一 regfile 超过 5 次读取，
// BSC 触发 G0002（register read port limit exceeded）。
//
// 正确做法：限制单 cycle 内的读取次数不超过 5，拆分到多个 rule
// 或使用多个 regfile 实例分担读压力。

package TrapArbiter1BSV;

import RegFile::*;

interface ArbIFC;
    method Bit#(8) get_result;
endinterface

(* synthesize *)
module mkTrapArbiter1(ArbIFC);
    // 单个 regfile，通过 arbiter 最多 3 个读端口（安全范围内）
    RegFile#(Bit#(4), Bit#(8)) rf <- mkRegFile(0, 15);
    Reg#(Bit#(8)) result <- mkReg(0);
    Reg#(Bit#(4)) addr <- mkReg(0);

    // 初始化：逐个地址写入（顺序，不触发冲突）
    Reg#(Bit#(4)) init_idx <- mkReg(0);
    Reg#(Bool) inited <- mkReg(False);
    rule init_rf (!inited);
        rf.upd(init_idx, extend(init_idx) * 2);
        if (init_idx == 14)
            inited <= True;
        else
            init_idx <= init_idx + 1;
    endrule

    // 每次只读 3 个端口（安全，不触发 G0002）
    rule do_read (inited);
        let a = rf.sub(addr);        // 读1
        let b = rf.sub(addr + 1);    // 读2
        let c = rf.sub(addr + 2);    // 读3 — 总计 3 个读端口
        result <= a + b + c;
        addr <= addr + 1;
    endrule

    // 常见错误（注释示意）：
    // 在同一 rule 中读 6 个地址 → G0002
    //   let a = rf.sub(addr);
    //   let b = rf.sub(addr+1);
    //   ...
    //   let f = rf.sub(addr+5);  // 第 6 个 → G0002!

    method Bit#(8) get_result = result;
endmodule

endpackage
