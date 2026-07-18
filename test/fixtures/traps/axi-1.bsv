// Trap axi-1: AXI4 接口 port 名与 BSV method 名不一致 — 用 Verilog wrapper
// 第三方 AXI4 IP 的 Verilog port 名（如 S_AXI_WDATA、S_AXI_WVALID）
// 往往无法直接作为 BSV method 名。BVI import 提供映射机制：
//   method <bsMethodName>(<verilogPort>, ...) enable(<verilogPort>) ...
// 当映射关系复杂或需要统一命名风格时，创建一个薄 Verilog wrapper
// 重命名 port，使 BVI import 更清晰可维护。

// BVI import: 将 Verilog port 名映射为符合 BSV 命名习惯的 method 名
interface AxiSlave_IFC;
    method Action   write(Bit#(32) data);
    method Bit#(32) read();
    method Bit#(1)  read_valid();
endinterface

import "BVI" axi_slave =
module mkAxiSlave(AxiSlave_IFC);
    default_clock (ACLK);
    default_reset (ARESETn);

    // Verilog port S_AXI_WDATA → BSV method write(data)
    // Verilog port S_AXI_WVALID → enable signal
    method write(S_AXI_WDATA) enable(S_AXI_WVALID);

    // Verilog port S_AXI_RDATA → BSV method read()
    method S_AXI_RDATA read();

    // Verilog port S_AXI_RVALID → BSV method read_valid()
    method S_AXI_RVALID read_valid();

endmodule

(* synthesize *)
module mkAxiTrapTest(Empty);
    AxiSlave_IFC slave <- mkAxiSlave();
    Reg#(Bit#(32)) cnt <- mkReg(0);

    rule tick;
        slave.write(cnt);
        cnt <= cnt + 1;
    endrule
endmodule
