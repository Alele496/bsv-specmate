# BSV 代码风格参考

> 从生产级代码（open-rdma-rtl）和教学项目（BSV 中文教程）蒸馏的 3 种风格。
> 通过 `lookup_ref(topic="styles")` 查阅。

---

## 风格 1：保守稳健型

**特征**：扁平 Reg、标准库 FIFOF、Bit#(1) 控制信号、显式调度标注。

**核心规则**：
- 控制信号用 `Reg#(Bit#(1))` 而非 `Reg#(Bool)`——可拼接，不冲突
- 数据传递用 `mkFIFOF` / `mkSizedFIFOF`，不手写环形缓冲区
- 模块内 rule 全在 method 之前
- 跨模块 method 调用与内部 rule 互斥时，显式 `descending_urgency`
- 状态机枚举 case 穷举所有值，省略 default

**示例**（来自 specmate 实验 Agent B）：

```bsv
Reg#(Bit#(1))  enable      <- mkReg(0);
Reg#(Bit#(1))  auto_reload <- mkReg(0);
FIFOF#(Bit#(8)) tx_fifo   <- mkSizedFIFOF(8);

(* descending_urgency = "tx_load, tx_fsm" *)
rule tx_load;
    tx_shift <= tx_fifo.first;
    tx_fifo.deq;
endrule
```

**适合场景**：新模块开发、团队协作、追求零意外编译错误。

---

## 风格 2：精巧紧凑型

**特征**：Vector、高阶函数、genWith、最小行数、利用 BSV 多态。

**核心规则**：
- 用 `Vector#(n, t)` + `genWith` 组织数组结构
- 用 `fold` / `map` / `zipWith` 做组合逻辑
- `function` 前置集中定义，module 体内简洁
- 避免冗余中间寄存器——仅保留必要的流水寄存器
- 利用 `Integer` 做编译期 for 循环展开

**示例**（来自 BSV 教程 200 行 RISC-V CPU）：

```bsv
Vector#(4, Bit#(8)) v = genWith(fromInteger);
Bit#(32) sum = fold(\+ , 0, values);

function Bit#(5) priorityEncode(Bit#(32) x);
    for (Integer i = 0; i < 32; i = i + 1)
        if (x[i] == 1) return fromInteger(i);
    return 0;
endfunction
```

**适合场景**：个人项目、原型验证、追求代码简洁和表达力。

---

## 风格 3：工程量产型

**特征**：BVI import、vendor wrapper、pipeline checker、Connectable 链。

**核心规则**：
- 用 `if (genVerilog)` 分离仿真路径和生产路径
- 仿真时用纯 BSV 实现，综合时 BVI import 厂商优化 IP
- 管道用带 `FullAutoAssert` 的 FIFO 检测反压 bug
- 接口定义用 `Client` / `Server` 标准接口，加 `Connectable` 实例
- 关键路径用 `LFIFO` 做流水寄存器插入
- `DebugConf` 参数贯穿全链路

**示例**（蒸馏自 open-rdma-rtl）：

```bsv
module mkAutoBram(MyBRam#(tAddr, tData))
    provisos (Bits#(tAddr, szAddr), Bits#(tData, szData));

    MyBRam#(tAddr, tData) inst;
    if (genVerilog) begin
        inst <- mkAutoBramBVI("bram_wrapper.v");
    end else begin
        inst <- mkAutoBramBSV;
    end
    return inst;
endmodule
```

**适合场景**：FPGA 流片项目、跨平台复用、需要综合质量保证。

---

## 风格 4：极简原型型 ✨新增

**特征**：最小可行实现、不写多余代码、功能优先。能用默认值不用显式配置，能省略的 guard 就省略（安全边界由使用者负责）。

**核心规则**：
- 纯组合接口能省则省（`method val = reg` 而非 `method val; return reg; endmethod`）
- FIFO 用默认深度 `mkFIFOF` 而非 `mkSizedFIFOF`
- 控制信号直接 `Bool` 而非 `Bit#(1)`——简单场景下编译器能处理
- 不写 `descending_urgency`，让编译器推断（除非编译报 warning）
- 最小化 import 数量——只导入实际用到的包

**示例**：

```bsv
import FIFOF::*;

interface SimplePipe;
    method Action put(Bit#(8) x);
    method Bit#(8) get;
endinterface

module mkSimplePipe(SimplePipe);
    FIFOF#(Bit#(8)) f <- mkFIFOF;

    method Action put(Bit#(8) x) = f.enq(x);
    method Bit#(8) get = f.first;
endmodule
```

**适合场景**：快速原型验证、Hackathon、个人项目——功能先跑通，后续重构时换保守稳健型。

---

## 风格 5：实验探索型 ✨新增

**特征**：不追求编译通过速度，而是探索 BSV 的语言能力——高阶函数、多态、typeclass、自定义 provisos。代码可能不稳定，但每一行都在测试 BSV 的极限。

**核心规则**：
- 用 `typeclass` + `instance` 做多态抽象（而非 `if-else` 分支）
- 用 `Vector#(n, t)` + `fold/map/zipWith` 做函数式组合逻辑
- 用 `Integer` + `for` 循环做编译期展开
- 自定义 `provisos` 约束链（如 `Add#(a, b, c)`）
- 不追求首次编译通过——每次实验都在积累"BSV 语言的边界"

**示例**（蒸馏自 BSV 教程）：

```bsv
typeclass ToBits#(type t, numeric type n)
    dependencies (t determines n);
    function Bit#(n) pack(t x);
    function t unpack(Bit#(n) x);
endtypeclass

instance ToBits#(Tuple3#(Bool, Bit#(8), Bit#(8)), 17);
    function Bit#(17) pack(Tuple3#(Bool, Bit#(8), Bit#(8)) x);
        match {.b, .h, .l} = x;
        return {pack(b), h, l};
    endfunction
    function Tuple3#(Bool, Bit#(8), Bit#(8)) unpack(Bit#(17) x);
        return tuple3(unpack(x[16]), x[15:8], x[7:0]);
    endfunction
endinstance
```

**适合场景**：学习 BSV 高级特性、写库代码、探索"BSV 能做什么"——不做生产，做实验。

---

## 风格选择速查

| 需求 | 推荐风格 |
|------|---------|
| 快速原型 / Hackathon | 极简原型型 |
| 第一次写 BSV / 新模块 | 保守稳健型 |
| 追求简洁 / 探索 BSV 表达力 | 精巧紧凑型 |
| 生产级 FPGA / ASIC | 工程量产型 |
| 学习 BSV 高级特性 / 写库 | 实验探索型 |

五种风格不互斥——可以在同一个项目的不同模块用不同风格。
