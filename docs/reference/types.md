# 类型系统

## 基础类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `Bit#(n)` | n 位位向量 | `Bit#(8)` |
| `Bool` | 布尔（逻辑）类型 | `True` `False` |
| `Int#(n)` | n 位有符号整数 | `Int#(32)` |
| `UInt#(n)` | n 位无符号整数 | `UInt#(16)` |
| `Integer` | 任意精度整数（仅 compile-time） | 用于 for 循环边界 |

## Bool vs Bit#(1)

**两者不同！**

```bsv
Bool  → 逻辑操作符: ! && || == !=
Bit   → 位操作符:   ~ & | ^ == !=

// 错误
Bool flag = True;
flag = ~flag;           // T0061

// 正确
flag = !flag;

// Bit#(1) 可以用位操作符
Bit#(1) b = 1;
b = ~b;                 // OK
b = b & 1;              // OK
```

## 复合类型

### Tuple
```bsv
Tuple2#(Bool, Bit#(8)) x = tuple2(True, 8'hFF);
match {.valid, .data} = x;
let {v, d} = x;           // 解构简写
```

### Struct
```bsv
typedef struct {
    Bit#(8)  addr;
    Bool     write;
    Bit#(32) data;
} Cmd deriving (Bits, Eq);
```

### Enum
```bsv
typedef enum {Idle, Read, Write} State deriving (Bits, Eq, FShow);

// 自枚举类型不需要 default 分支（避免 G0004）
Reg#(State) state <- mkReg(Idle);
rule rl_state;
    case (state)
        Idle: ...
        Read: ...
        Write: ...
        // 不需要 default
    endcase
endrule
```

### Maybe / Tagged Union
```bsv
Reg#(Maybe#(Bit#(8))) val <- mkTaggedInvalid;
// 写入: val <= tagged Valid 42;
// 读取:
if (val matches tagged Valid .v)
    // 使用 v
```

## 类型转换

```bsv
// 扩展/截断
Bit#(16) a = extend(b);    // b: Bit#(8)，零位扩展
Bit#(8)  c = truncate(a);  // 高位截断

// pack/unpack
Bit#(n) bits = pack(struct_val);
T val = unpack(bits);

// Bool ↔ Bit#(1)
Bit#(1) b = pack(flag);    // Bool → Bit#(1)
Bool f = unpack(b);        // Bit#(1) → Bool
```

## 常见寄存器/状态

```bsv
Reg#(Bit#(8)) r       <- mkReg(0);       // 带初始值
Reg#(Bit#(8)) r       <- mkRegU;          // 未初始化
Reg#(Maybe#(t)) r     <- mkDReg(tagged Invalid);  // pulse 寄存器（下 cycle 回 default）
FIFOF#(Bit#(8)) f     <- mkFIFOF();       // guarded FIFO
RWire#(Bit#(8)) w     <- mkRWire;         // 单 cycle wire
PulseWire p           <- mkPulseWire;     // 脉冲信号
```
