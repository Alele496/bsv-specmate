# BSV Agent — Bluespec 编码辅助工具

> 目标：帮助 AI Agent 编写正确的 BSV (Bluespec SystemVerilog) 代码。

## specmate — 3 个 MCP 工具

| 工具 | 作用 | 输入 | 输出 |
|------|------|------|------|
| `specmate_guide` | 知识导航引擎 | `phase` + `input` | 陷阱预测 / 错误诊断 / 方案选择 / 下一步 |
| `specmate_check` | 静态检查 (18 条规则) | `files: ["bsv/Foo.bsv"]` | 问题列表 (错误码 + 行号 + 建议) |
| `specmate_learn` | 新错误入库 | code, title, bsc_output, cause, solution | 确认信息 |

### specmate_guide 的 4 个 phase

```
phase="pre_code"  → 编码前陷阱预测 + 编码记忆 + 参考文档
phase="on_error"  → 编译报错诊断 (原因 + 方案 + 交叉引用)
phase="continue"  → 下一步陷阱预测 + 热点知识
phase="decide"    → 方案对比 (FIFO/BRAM/Reg 等) + 推荐
```

## 典型工作流

```
开始任务 → specmate_guide(phase="pre_code", input="简短描述当前任务")
    │
写代码   → (specmate 静默在幕后，需要时可随时调 guide)
    │
写完检查 → specmate_check(files=["bsv/Foo.bsv"])
    │
编译 (bsc)
    ├─ 通过 → 完成，下一步调 specmate_guide(phase="continue", input="...")
    └─ 报错 → specmate_guide(phase="on_error", input="G0004 ...")
                 ├─ 命中 → 按方案修复 → 重新编译
                 └─ 未收录 → specmate_learn(code="G0124", ...) → 继续
```

## 能力等级 (SPECMATE_LEVEL)

| Level | 名称 | 干涉方式 | 适用场景 |
|-------|------|---------|---------|
| `silicon` | 静默 | 最小化输出，纯应答 | 轻量修改、已知 bug |
| `wafer` (默认) | 引导 | 交叉引用 + 陷阱预测 | 日常开发 |
| `tapeout` | 全程协作 | 详细讲解 + 下一步引导 + 持续追踪 | 新模块、复杂项目 |

配置方式：

```json
{
  "mcpServers": {
    "bsv-specmate": {
      "command": "npx",
      "args": ["bsv-specmate"],
      "env": { "SPECMATE_LEVEL": "tapeout" }
    }
  }
}
```

## 编译

### 有 bsc 环境 (WSL / Linux)

```sh
bsc -u -verilog -vdir verilog -bdir build bsv/Top.bsv
```

### 无 bsc 环境 (仅 Windows)

跳过编译环节，只依赖 `specmate_check` 做静态预检。如需完整编译，先在 WSL 中安装 bsc。

## 数据存储

- **SQLite 知识库** → 位于 `~/.specmate/data/knowledge.db`
- **自定义路径** → `SPECMATE_DATA` 环境变量
- **导出为文档** → `npm run db:export`
- **从文档重建** → `npm run db:seed`

## 环境

- Bluespec Compiler version 2025.07
- 测试套件来源：B-Lang-org/bsc
- 用户数据默认路径：`~/.specmate/`
