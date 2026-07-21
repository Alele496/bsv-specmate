# union-1: tagged 构造带数据的 tag 必须传参

> 适用 BSC 版本: 2025.07

## 现象

Union 类型中，构造带数据成员的 tag 时没有传入数据参数，触发 T0144。

## 原因

BSV union 的 `tagged` 构造语法中，带数据的 tag 成员必须提供对应的数据值。只写 `tagged Valid`（缺少数据参数）时，编译器无法确定数据字段的值，触发 T0144 类型错误。

## 解决方案

构造带数据的 tag 时必须传入数据参数：`tagged Valid 8'h42`

```bsv
typedef union tagged {
    Bit#(8) Valid;
    void Invalid;
} Result deriving(Bits, Eq);

// 错误 — 缺少 data 参数
Result r = tagged Valid;  // T0144

// 正确 — 传入 data 值
Result r = tagged Valid 8'h42;
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: T0144
