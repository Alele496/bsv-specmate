# BSV 结构体

## 基本语法

### 定义
```bsv
typedef struct {
    Bool field1;
    Bit#(8) field2;
} MyStruct deriving (Bits, Eq);
```

### 构造
```bsv
// 字面量
MyStruct x = MyStruct { field1: True, field2: 0 };

// 逐个赋值
MyStruct x;
x.field1 = True;
x.field2 = 0;
```

### 访问
```bsv
Bool b = x.field1;
Bit#(8) v = x.field2;
```

### 更新 (partial update)
```bsv
x = x { field1: False };  // 只改 field1，其他不变
```

### 模式匹配 (match)
```bsv
match MyStruct { field1: .f1, field2: .f2 } = x;
```

## 常见错误

### T0016 — 字段名不存在
```bsv
typedef struct { Bit#(2) field1; } S1;
typedef struct { Bit#(2) field2; } S2;

function S1 f();
    return (S1 { field2: 0 });  // 错误：S1 没有 field2
endfunction
```
**修复**：使用 `S1 { field1: 0 }`

```bsv
function S1 f();
    S1 x;
    x.field2 = 0;  // 错误：S1 没有 field2
    return x;
endfunction
```
**修复**：`x.field1 = 0`

### T0016 — 未导入结构体字段
```bsv
import SomePkg::*;

function Bool fn(SomeType x);
    return x.foobar;  // 错误：foobar 不存在于 SomeType
endfunction
```
**修复**：确认字段名是否正确，或确认 `SomePkg` 导出了该类型。

### 重复字段名
```bsv
// 在同一个 struct 字面量中重复字段
S1 { field1: True; field1: True }  // 错误
```

### 限定名称冲突
```bsv
import FloatingPoint;
fn = Half { sign = True; Foo.sign = 0 }  // 错误：Foo 不是 Half 的类型
```

## Struct 嵌套

```bsv
typedef struct {
    Bool flag;
    S1 inner;
} Outer deriving (Bits);

Outer o = Outer { flag: True, inner: S1 { field1: 0 } };
Bool b = o.inner.field1;  // 链式访问
```

## 注意事项

- 需要 `deriving (Bits)` 才能用于寄存器、FIFO 等
- 需要 `deriving (Eq)` 才能用 `==` 比较
- 需要 `deriving (FShow)` 才能用 `$display`
- struct 字面量中字段顺序无要求
