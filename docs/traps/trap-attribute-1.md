# attribute-1: synthesize 不拼写成 synthesized

> 适用 BSC 版本: 2025.07

## 现象

在模块上使用了 `(* synthesized *)`（过去分词）而非 `(* synthesize *)`（动词原形），触发 P0085 未识别的 attribute pragma。

## 原因

BSV 中 `synthesize` 是关键字形式的 attribute pragma，是固定名称而非英语单词。过去分词形式 `synthesized` 不在 BSC 的已知 pragma 列表中，编译器将其视为未识别的 attribute 并报告 P0085。

## 解决方案

始终使用动词原形：`(* synthesize *)`

```bsv
// 错误 — 过去分词
(* synthesized *)   // P0085
module mkMod(TestIFC);
endmodule

// 正确 — 动词原形
(* synthesize *)
module mkMod(TestIFC);
endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: P0085
