# {项目名称}

{项目描述 —— 描述要做什么，不用指定怎么实现}

## 模块清单或任务描述

{列出所有模块/子任务}

## 接口约定

{统一的接口规范 —— 总线、信号、命名约定}

代码写在 bsv/ 下。

## specmate 编码流水线

1. **动手前** — `npx specmate scan "你的任务" [--file=MyModule.bsv]`
   预编码检查：陷阱提醒 + 设计决策建议 + AST 预编译扫描 + 下一步指南。

2. **写完自查** — `npx specmate check bsv/*.bsv`
   快速静态检查：字面量溢出、零位宽、Bool 误用。

3. **编译失败** — `specmate_guide(phase="on_error", input="错误码")`
   查已知根因和修复方案。修好后调 `specmate_resolve` 保存经验。

4. **不确定语法** — `npx specmate example <关键词>`
   从官方 BSC 示例库搜索真实用法片段。如 `npx specmate example mkFIFO`。

编译：`bsc -u -verilog -vdir verilog -bdir build bsv/Top.bsv`

