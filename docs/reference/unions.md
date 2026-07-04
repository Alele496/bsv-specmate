# BSV Tagged Union

Tagged Union 是 BSV 的代数数据类型（类似 Rust enum），用于表示互斥的状态或数据结构。

## 基本语法

```bsv
typedef union tagged {
    void Idle;
    Bit#(8) Active;
    Bool Error;
} State deriving (Bits, Eq);
```

## 构造 Union 值

```bsv
// 无数据 tag
State s = tagged Idle;

// 带数据 tag
State s = tagged Active 8'hFF;
State s = Active;  // 错误！Active 有数据，不能省略参数
```

## 模式匹配 (case matches)

```bsv
case (state) matches
    tagged Idle : doSomething;
    tagged Active .val : handleActive(val);
    tagged Error .err : handleError(err);
endcase
```

## 常见错误

### T0144 — Union 构造参数不匹配
```bsv
typedef union tagged { Bool Foo; } Bar;

Bar x = Foo;  // 错误：Foo 关联 Bool 类型，需要参数
Bar x = tagged Foo True;  // 正确
```

### T0016 — Union 成员不是 struct 字段
```bsv
MyT2 x = mkT2;
return x.field1;  // 错误：Union 类型不能直接 .field1 访问
                  // 用 case matches 而非 struct 字段访问
```

## Union 与 Struct 的区别

| | Struct | Union |
|---|---|---|
| 所有字段同时存在 | ✅ | ❌ |
| 同一时刻只有一种状态 | ❌ | ✅ |
| 用 `.field` 访问 | ✅ | ❌ |
| 用 case matches 访问 | ❌ | ✅ |
| 用于状态机/多态数据 | ❌ | ✅ |
