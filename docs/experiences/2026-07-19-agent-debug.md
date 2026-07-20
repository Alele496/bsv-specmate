---
code: T0033
title: zeroExtend() 宽度推断歧义
severity: compile
keywords: [zeroExtend, 宽度推断, 类型推断, T0033, T0035]
source: agent
bsc_versions: ['2025.07']
---

## 现象
zeroExtend() 在比较/算术/let 绑定中 BSC 无法推断目标宽度，报类型推断错误。常见于：
- `if (zeroExtend(x) > y)` — BSC 不知道 zeroExtend 的目标位宽
- `let z = zeroExtend(a) + b` — 等号右侧无类型上下文

## 原因
BSC 的类型推断引擎在处理嵌套表达式时无法从上下文推导 zeroExtend 的目标宽度。zeroExtend() 需要一个显式的目标类型（Bit#(n)），但 BSC 不总是能从周围的比较或算术运算中反向推导。

## 解决
使用显式类型中间变量：
```bsv
Bit#(16) x_ext = zeroExtend(x);
if (x_ext > y) ...
```
或直接指定 pack 目标：
```bsv
zeroExtend(x)  // BSC 报错
pack(x)[15:0]  // 显式宽度，BSC 接受
```

## 为什么是陷阱
逻辑上正确的代码，编译器不够聪明导致报错。开发者容易认为"zeroExtend 到更大的类型用于比较"是显而易见的，但 BSC 的类型推断有局限。

---
code: X-REGFILE-VERILATOR
title: mkRegFileWCF Verilator 未初始化警告
severity: quality
keywords: [mkRegFileWCF, Verilator, 未初始化, 寄存器文件, regfile, lint]
source: agent
---

## 现象
使用 mkRegFileWCF（Write Care First）构建的寄存器文件在 Verilator lint 中报告 `UNOPTFLAT` 或未初始化值警告。寄存器文件在仿真中看似正常工作，但 Verilator 静态分析识别到组合逻辑环路或未初始化路径。

## 原因
mkRegFileWCF 内部实现使用了 write-before-read 语义的组合逻辑路径。Verilator 的静态分析无法识别 BSV 生成的保证（同一周期内写优先于读），将其标记为潜在的组合环路。此外，Verilator 将寄存器文件初始状态视为未初始化（x 态），而 BSV 语义保证复位后的确定性。

## 解决
1. 在 Verilator 命令行添加豁免：`verilator -Wno-UNOPTFLAT -Wno-UNDRIVEN`
2. 对寄存器文件添加显式复位逻辑，确保所有条目在上电时已知
3. 如 lint 严格要求，可换用 mkRegFile（非 WCF 版本）消除写优先保证的组合路径

## 为什么是陷阱
硬件行为正确（BSV 语义保证），但工具链静态分析产生误报。开发者可能花大量时间追查"不存在"的组合环路，实际是 Verilator 模型与 BSV 语义的 mismatch。

---
code: T0020
title: BSV 算术操作数位宽显式匹配
severity: compile
keywords: [算术, 位宽, 操作数, 类型匹配, T0020, Bit#]
source: agent
---

## 现象
BSV 编译器报类型错误：算术运算（+、-、*、/、%）的操作数位宽不匹配，或结果位宽与目标不匹配。例如：
- `Bit#(8) a = x + y`；其中 `x` 和 `y` 位宽不同
- 乘法结果自动扩展，与赋值目标位宽冲突

## 原因
BSV 不执行隐式位宽扩展或截断（与 Verilog 的自动扩展不同）。每个算术操作符要求两个操作数位宽相同，且结果位宽由操作数决定。这确保了硬件综合的精确性，但增加了编码时的显式性要求。

## 解决
显式统一操作数位宽：
```bsv
Bit#(16) a = zeroExtend(x) + zeroExtend(y);  // 两个都扩展到 16 位
Bit#(8) b = truncate(x + y);                 // 显式截断结果
```
或使用 pack/extend 链：`pack(x) + pack(y)` 先打包到统一宽度。

## 为什么是陷阱
从 Verilog 迁移过来的开发者习惯自动扩展。BSV 的严格要求是正确做法（显式 > 隐式），但学习曲线陡峭，每个算术语句都可能成为编译障碍。

---
code: X-FSM-BOUNDARY
title: FSM 子循环边界必须覆盖全部处理单元
severity: quality
keywords: [FSM, 子循环, 边界, StmtFSM, 状态机]
source: agent
---

## 现象
部分配置下正确，部分配置下静默错误。当配置的处理单元数量不是 2 的幂次时，FSM 子循环遗漏尾部单元，导致某些数据路径被跳过，输出结果不一致。

## 原因
循环上界基于活跃单元数而非总单元数。例如 `for (i = 0; i < activeCount; i = i + 1)` 在 activeCount 缩减时漏掉尾部。正确的循环应该覆盖全部物理单元，用内部条件过滤有效列。

## 解决
循环上界用总单元数，内部 if 过滤有效列：
```bsv
for (i = 0; i < totalUnits; i = i + 1) begin
    if (isActive(i)) begin
        // 处理逻辑
    end
end
```

## 为什么是陷阱
全部 active 时正常，部分 active 时才暴露。测试覆盖不足时很容易漏掉。BSV StmtFSM 的循环语义与软件不同 —— 每个 for 是硬件展开，边界错误不会触发异常，只会导致不完整的数据路径。

---
code: X-SIM-STORAGE
title: SimStorage 旁路加速仿真
severity: pattern
keywords: [SimStorage, 仿真加速, 存储, 旁路, simulation, mkSimCore]
source: agent
---

## 现象
大规模 BRAM/寄存器文件仿真极其缓慢。BSV 默认生成的存储模块在仿真器中被建模为逐周期精确的硬件行为，导致包含大容量存储的设计仿真速度难以接受。

## 原因
BSV 标准库生成的存储模块（mkBRAM、mkRegFile 等）在仿真中逐周期模拟读/写时序。对于大容量存储（>64KB），仿真器的内存访问模式与硬件差异巨大，Verilator/VCS 无法优化为批量内存操作。

## 解决
使用仿真专用存储旁路：
1. 用 `SimStorage` 包装大容量存储模块，提供仿真专用快速路径
2. 在 `mkSimCore` 中使用 `simulate()` 条件编译宏替换存储实现
3. 仿真时：直接访问宿主机大数组；综合时：使用真实 BRAM 宏

```bsv
Storage#(addr, data) mem <- mkSimStorage(mkBRAM);
```

## 为什么是陷阱
功能完全正确，但仿真速度可能慢 10-100 倍。开发者往往在功能验证后才意识到性能问题，此时重构存储接口成本更大。提前规划仿真专用存储路径可以避免后期返工。

---
code: X-BUSY-PENDING
title: busy() 信号覆盖所有异步操作
severity: quality
keywords: [busy, 异步, pending, 状态, 流水线, 握手]
source: agent
---

## 现象
模块的 busy() 信号在某个异步操作完成后过早 de-assert，但还有其他未完成的操作（如 in-flight 的流水线阶段、未完成的存储请求），导致上游模块误以为模块空闲并发送新请求，引发数据竞争或丢弃。

## 原因
busy() 实现只检查了当前正在处理的主要操作，遗漏了：
1. 流水线中已接受但未完成的事务
2. 已发出但未收到响应的外部存储请求
3. 多个独立子模块的并发 pending 状态

## 解决
busy() 必须聚合所有 pending 源：
```bsv
function Bool busy();
    return (state != IDLE) ||          // 当前状态非空闲
           pipelineNotEmpty() ||       // 流水线中仍有数据
           pendingMemReq ||            // 等待存储响应
           subModuleBusy();            // 子模块忙碌
endfunction
```

## 为什么是陷阱
单一操作测试时全部通过（busy 刚好在操作完成后 de-assert）。只有多操作连续压入，或有并发存储请求时才会暴露。是典型的覆盖率不足导致的漏测。
