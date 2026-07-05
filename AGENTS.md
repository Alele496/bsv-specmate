# {项目名称}

{任务描述、模块清单、接口约定}

代码写在 `bsv/` 下。

## specmate — 你的 BSV 领域搭档

specmate 是一个内置了 BSV 常见陷阱、编码规范和编译错误经验的助手。
它不会主动跳出来说话，**你需要的时候叫它**。

**什么时候问：**

- **动手前对设计没把握时**：`specmate_guide(phase="pre_code", input="你要做什么")`
  会告诉你这个场景下 BSV 常见的坑、推荐的设计模式、该查哪篇参考文档。
  简单的模块直接写就行，不用调。

- **写完文件想自查时**：`specmate_check(files=["bsv/Xxx.bsv"])`
  快速静态检查（不需要编译器），返回风格问题和潜在 bug。

- **编译报错不知道怎么修时**：`specmate_guide(phase="on_error", input="错误码或错误信息")`
  从编码记忆库里查这个错误的常见原因和修复方案。

specmate 是你的搭档，不是你的检查清单。拿不准的时候问它，有把握的时候直接写。

编译：`bsc -u -verilog -vdir verilog -bdir build bsv/Top.bsv`
