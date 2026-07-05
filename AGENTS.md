# {项目名称}

{任务描述、模块清单、接口约定}

代码写在 `bsv/` 下。

specmate 工具：
- 开始写新模块前 → specmate_guide(phase="pre_code", input="简短描述")
- 写完文件后 → specmate_check(files=["bsv/Xxx.bsv"])
- 编译报错后 → specmate_guide(phase="on_error", input="错误码")
- 其他情况 → 也问 specmate_guide，它会告诉你怎么用

编译：`bsc -u -verilog -vdir verilog -bdir build bsv/Top.bsv`
