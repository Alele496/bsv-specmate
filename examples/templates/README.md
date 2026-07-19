# 项目模板

快速搭建 BSV 项目，使用 specmate 知识引擎辅助 Agent 编码。

## 使用方法

1. 复制两个模板文件到你的 BSV 项目根目录：

```bash
cp examples/templates/AGENTS.md ./AGENTS.md
cp examples/templates/opencode.json ./opencode.json
```

2. 编辑 `AGENTS.md`，填入你的项目信息：

   - 替换 `{项目名称}`
   - 替换 `{项目描述}`
   - 填写模块清单和接口约定

3. `opencode.json` 中替换 `<绝对路径>` 为你的 bsv-specmate 实际安装路径

4. 打开 OpenCode 即可开始。Agent 读取 AGENTS.md 后开始编码，不确定 BSV 语法时自然会调用 specmate 工具。

## 模板说明

### AGENTS.md

极简模板，只包含项目任务和接口约定。**不包含**编码规则或工具列表。
Agent 第一次调用 `specmate_scan` 时，specmate 会自动展示完整工具箱。

### opencode.json

OpenCode MCP 配置，加载 specmate 知识引擎。
`SPECMATE_LEVEL` 设为 `develop`（日常开发级别），可改为 `verify`（轻量）或 `tapeout`（深度审查）。

## 实际示例

完整对照实验项目见 `bsv-test/project-periph/`（包含 4 个 Phase 的提示词和记录表）。
