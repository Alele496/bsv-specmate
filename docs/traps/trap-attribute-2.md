# attribute-2: urgency 规则名必须在本模块中存在

> 适用 BSC 版本: 2025.07

## 现象

`(* descending_urgency *)` 或 `(* execution_order *)` pragma 中引用了不存在的 rule 名称，触发 G0054。

## 原因

BSC 的调度 pragma 中引用的 rule 名称必须是当前模块内实际定义的 rule。如果 rule 名称拼写错误、大小写不匹配，或引用了其他模块的 rule，BSC 无法解析调度关系，触发 G0054。

## 解决方案

确保 pragma 中引用的所有 rule 名称都在当前模块中定义且拼写正确。注意 rule 名称区分大小写。

```bsv
// 错误 — rl_a 不存在
(* descending_urgency = "rl_b, rl_a" *)  // G0054: rl_a 未定义
module mkMod(TestIFC);
    rule rl_b;
        count <= 2;
    endrule
endmodule

// 正确 — 所有 rule 都存在
(* descending_urgency = "rl_b, rl_a" *)
module mkMod(TestIFC);
    rule rl_a;
        count <= 1;
    endrule
    rule rl_b;
        count <= 2;
    endrule
endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: G0054
