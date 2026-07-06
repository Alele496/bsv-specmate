# {项目名称}

{任务描述、模块清单、接口约定}

代码写在 `bsv/` 下。

## specmate — 你的 BSV 项目记忆搭档

specmate 帮你记住项目中犯过的错误和修复经验。它不会主动跳出来说话，**你需要的时候叫它**。

**什么时候问：**

- **动手前**：`specmate_guide(phase="pre_code", input="你要做什么")`
  提醒你近期项目里踩过的坑、相关的编码陷阱。简单模块直接写，不用调。

- **写完文件想快速自查**：`specmate_check(files=["bsv/Xxx.bsv"])`
  默认跑 3 项高精度检查（字面量溢出、零位宽、Bool 误用）。加 `full: true` 跑全部检查。

- **编译报错了**：
  1. 先调 `specmate_capture(bsc_output="...", files=["..."])` — 自动记录这次错误
  2. 再调 `specmate_guide(phase="on_error", input="错误码")` — 查有没有已知解法

- **修好之后**：`specmate_resolve(code="错误码", cause="原因", solution="怎么修的")`
  把修复经验存下来。**这是 specmate 越用越聪明的方式。** 下次同样错误码出现，pre_code 会主动提醒。

- **发现新的典型错误想永久记录**：`specmate_learn(code, title, bsc_output, cause, solution)`
  写入全局知识库，跨项目共享。

- **分析代码结构（AST 驱动）**：`specmate_analyze(files=["bsv/Xxx.bsv"], question="...")`
  用真正的 BSV 语法树分析代码。问什么就分析什么——不会主动扫一堆问题。
  典型问题：
  - `"调度冲突分析"` — 每个 rule 调了哪些子模块、有没有同 rule 多次写寄存器
  - `"模块依赖图"` — 模块之间谁实例化了谁
  - `"调用图"` — rule/method 之间的调用关系
  - `"寄存器读写分析"` — 每个寄存器被哪些 rule/method 写入
  - `"第156行"` — 某行代码在 AST 中的节点类型和上下文
  - 不确定的时候直接问 `"整体结构"` 也能得到摘要

specmate 是你的项目笔记本，不是你的检查清单。拿不准的时候问它，有把握的时候直接写。重要的是每次修完错误都 resolve 一下——项目记忆就是这样积累起来的。

编译：`bsc -u -verilog -vdir verilog -bdir build bsv/Top.bsv`
