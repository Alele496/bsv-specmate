# trap-g0053 — G0053: mkReg 用模块参数初始化

> 一句话：mkReg(module_param) 中 module_param 不是编译期静态常量——BSC 无法确定寄存器初始值是编译期常量，拒绝编译。
> 严重度：hard | bsc感知：报错 | 阶段：code

## 为什么这是陷阱

BSV 允许同一个模块用不同的参数多次实例化（如 SPI 主站的 CPOL 可以不同）。因此模块参数（module parameter）在 BSC 编译模型中不是编译期静态常量——它们的值在实例化时才确定。`mkReg(initial_value)` 要求 `initial_value` 是编译期确定的常量（对应硬件中的寄存器初始值），传入模块参数违反了这一约束。

这在 SPI/UART/I2C 等需要参数化极性、分频系数、地址宽度的模块中高频出现。

## 错误表现

### bsc 报错

```
Error: "./SPI.bsv", line 25, column 18: (G0053)
  Parameter of submodule is instantiated with a dynamic expression.
  The submodule `mkReg` requires a compile-time constant for its
  initial value, but the expression depends on a module parameter.
  Module parameters are not compile-time constants because the
  module may be instantiated multiple times with different values.
```

## 正确模式

```bsv
// ❌ 错误写法
module mkSPI#(parameter Bit#(1) cpol)(SPI);
    Reg#(Bit#(1)) sck <- mkReg(cpol);  // G0053: cpol 不是编译期常量
endmodule

// ✅ 正确写法：用 mkRegU + rule 显式写入初始值
module mkSPI#(parameter Bit#(1) cpol)(SPI);
    Reg#(Bit#(1)) sck <- mkRegU;       // 无初始值
    // 在第一个周期写入初始值
    rule init (!init_done);
        sck <= cpol;
        init_done <= True;
    endrule
endmodule

// ✅ 备选：如果参数确实只有常数值，用 Integer 参数而非 Bit#(n)
module mkSPI#(Integer cpol_val)(SPI);
    Reg#(Bit#(1)) sck <- mkReg(fromInteger(cpol_val));
endmodule
```

## BSC 参考

- BSC Libraries Reference §mkReg
- BSC User Guide §3.2 "Module Parameters vs Compile-Time Constants"

## 实际案例

SPI/UART/I2C 任务中，Agent 尝试用 `mkReg(polarity_param)` 初始化寄存器以支持可配置极性，触发 G0053。此陷阱在需要参数化的接口模块中高频出现，因为模块参数天然被 Agent 当作"配置值"试图填入寄存器初始值。

## 关联陷阱

- trap-g0004 — G0004: 单 rule 内多子模块 Action 方法调用
