# BSC 标准库速查

> 来源：B-Lang-org/bsc `src/Libraries/Base1/`

## 基础模块

### Reg — 寄存器

```bsv
import Reg::*;
```

| 模块 | 说明 |
|------|------|
| `mkReg(v)` | 带初始值寄存器 |
| `mkRegU` | 未初始化寄存器 |
| `mkDReg(v)` | 脉冲寄存器（下 cycle 自动回默认值）|
| `mkCReg(n, v)` | n 份冲突寄存器副本（交错写冲突）|

```bsv
Reg#(Bit#(8)) r <- mkReg(0);       // 初始值 0
Reg#(Bit#(8)) r <- mkRegU;          // 未初始化
Reg#(Bool)    p <- mkDReg(False);   // 下 cycle 自动回 False
Reg#(Bit#(8)) r <- mkCReg(2, 0);    // 两个独立写端口
```

### RWire — 单周期线

```bsv
import RWire::*;
```

```bsv
RWire#(Bit#(8)) rw <- mkRWire;

// 写端
method Action set(Bit#(8) v) = rw.wset(v);

// 读端（wget 返回 Maybe#(t)）
if (rw.wget matches tagged Valid .v) begin
    // 有数据写入时的处理
end
```

> **注意**: RWire 只存活一个 cycle。跨 rule 传数据用 FIFOF，不要 PulseWire+Reg。

### PulseWire — 脉冲信号

```bsv
PulseWire pw <- mkPulseWire;

// 发送 pulse
pw.send();

// 读取（返回 Bool）
if (pw) begin ... end
```

### Wire / mkDWire

```bsv
Wire#(Bit#(8)) w <- mkDWire(0);     // 默认值 0
```

## FIFO 族

### FIFO 接口（隐式 full/empty）

```bsv
import FIFO::*;

FIFO#(Bit#(8)) f <- mkFIFO;
f.enq(42);
f.deq();
let x = f.first;
f.clear();
```

| 模块 | 深度 | 说明 |
|------|------|------|
| `mkFIFO` | 2（默认） | 标准 FIFO，满时不能同时 enq+deq |
| `mkFIFO1` | 1 | 单元素 FIFO |
| `mkSizedFIFO(n)` | n | 指定深度 |
| `mkLFIFO` | 1（默认） | Loopy：满时可以同时 enq+deq（deq 优先）|
| `mkLSizedFIFO(n)` | n | Loopy + 指定深度 |
| `mkDepthParamFIFO(n)` | n（运行时） | 运行时指定深度（UInt 32）|

### FIFOF 接口（显式 full/empty）

```bsv
import FIFOF::*;

FIFOF#(Bit#(8)) f <- mkFIFOF;

// 带 guard 的方法（常用）
f.enq(42)  when f.notFull;
f.deq()    when f.notEmpty;
let x = f.first when f.notEmpty;

// 状态查询
Bool full  = !f.notFull;
Bool empty = !f.notEmpty;
```

| 模块 | 深度 | 说明 |
|------|------|------|
| `mkFIFOF` | 2 | 标准 FIFOF |
| `mkFIFOF1` | 1 | 单元素 |
| `mkSizedFIFOF(n)` | n | 指定深度 |
| `mkLFIFOF` | 1 | Loopy（满时同时读写，deq 先）|
| `mkLSizedFIFOF(n)` | n | Loopy + 指定深度 |

**UG 系列**（Unguarded，不推荐）：`mkUGFIFOF`、`mkUGFIFOF1` 等。guard 不生效，可能 enq 到满 FIFO。极少场景。

**调度说明**：
- 标准 FIFO 满时 `notFull = False`，阻止 enq
- Loopy FIFO 满时 deq 和 enq 可以同 cycle（deq → enq 顺序）
- Loopy 有组合路径：deq ready → enq ready

### 常用 FIFO 选择指南

| 场景 | 推荐 |
|------|------|
| 两个 rule 之间传数据 | `mkFIFOF` |
| 单元素缓冲 | `mkFIFOF1` |
| 需要满时同时读写 | `mkLFIFOF` |
| 流水线缓冲 | `mkFIFOF1` 或 `mkBypassFIFO` |
| 跨时钟域 | `mkSyncFIFO` (在 `Clocks.bsv`) |

## Vector — 定长数组

```bsv
import Vector::*;

Vector#(4, Bit#(8)) v;
v = genWith(fromInteger);           // 创建 Vector
v[0] = 1;                           // 索引
Vector#(4, Bit#(8)) v2 = map(f, v); // 映射
```

> ⚠️ `vec()` 不存在！详见 `lookup_error("T0004")`

## RegFile — 结构化寄存器文件

```bsv
import RegFile::*;

RegFile#(Bit#(8), Bit#(32)) rf <- mkRegFileFull;
rf.upd(addr, value);    // 寄存器写
let val = rf.sub(addr); // 组合读
```

## 其他常用

| 包 | 说明 |
|---|------|
| `GetPut::*` | Get/Put 接口（单向数据流）|
| `ClientServer::*` | Client/Server 接口（请求-响应）|
| `Connectable::*` | 管道连接（`mkConnection`）|
| `FShow::*` | 格式化输出（`$display` 的 BSV 等价）|
| `StmtFSM::*` | 基于语句的测试 FSM |
| `BUtils::*` | 杂项工具函数 |
| `BRAMFIFO::*` | 基于 BRAM 的大深度 FIFO |
