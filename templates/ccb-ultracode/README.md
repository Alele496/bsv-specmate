## 独立开发：Goal Prompt 模板

### 直接粘贴到 CCB goal 窗口

```text
Goal: {任务描述}。代码写在 bsv/ 下。

用 specmate，按以下步骤：
1. specmate_guide(phase="pre_code", input="简短描述任务") — 编码前查陷阱
2. 写代码
3. specmate_check(files=["bsv/每个.bsv"]) — 写完检查
4. 编译报错 → specmate_guide(phase="on_error", input="错误码")
5. 不确定 → specmate_guide(phase="decide", input="选项A vs 选项B")

写完所有文件后告诉我——不要自编译。一次性写完。
```

### 省 Token 版（一行式）

```text
Goal: {任务描述}。用 specmate。调 guide(pre_code)→写→check→编译报错调 guide(on_error)→修。不要自编译。
```

### 独立开发 vs 协作开发 (Ultracode)

| 模式 | 什么时候用 | 怎么写提示词 |
|------|----------|-----------|
| **独立开发 (solo)** | 小改动、简单模块、只想快速跑通 | 用上面的 goal 模板，嵌入 5 步流程 |
| **协作开发 (Ultracode)** | 大项目、新模块、追求代码质量 | 用 bsv-dev workflow（Coder + Reviewer 自动循环） |
