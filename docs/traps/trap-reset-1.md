# reset-1: Reset 类型需要显式 import Reset :: *

> 适用 BSC 版本: 2025.07

## 现象

模块中使用 `Reset rst` 类型但未导入 `Reset :: *`，BSC 触发 T0051 未定义类型错误。

## 原因

BSV 中 `Reset` 类型定义在 `Reset` package 中。即使 `exposeCurrentReset` 函数在 BSV prelude 中可用，`Reset` 类型本身仍然需要显式导入。不导入则编译器无法识别 `Reset` 为已知类型。

## 解决方案

在文件顶部添加 `import Reset :: *;`

```bsv
// 错误
module mkMod(Empty);
    Reset rst <- exposeCurrentReset;  // T0051
endmodule

// 正确
import Reset :: *;

module mkMod(Empty);
    Reset rst <- exposeCurrentReset;
endmodule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: T0051
