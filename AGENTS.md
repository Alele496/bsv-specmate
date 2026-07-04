# BSV Agent — Bluespec 编码辅助工具

> 目标：帮助 AI Agent 编写正确的 BSV (Bluespec SystemVerilog) 代码。

## MCP 工具

本 MCP Server 提供 7 个工具，Agent 通过 MCP 协议直接调用：

| 工具 | 作用 | 输入 | 输出 |
|------|------|------|------|
| `coding_rules` | 编码硬约束 | 无（自动读 level） | 高频错误衍生的编码规则列表 |
| `preflight` | 编码前速览 | 无（自动读 level） | 高频错误速览 + 设计警告 + 编码建议 |
| `check_style` | 编译前静态检查 | 文件路径列表 | 问题列表 (错误码 + 行号 + 建议) |
| `lookup_error` | 查编码记忆 | 错误码 (如 "P0005") | 现象 + 原因 + 方案 + 计数 |
| `lookup_ref` | 查 BSV 规范 | "module"/"types"/"syntax"/"examples" | 对应文档全文 |
| `lookup_example` | 搜官方用例 | 关键词 + 可选子目录 | 匹配的 .bsv 代码片段 |
| `add_error` | 追加新错误 | code, title, bsc_output, cause, solution, rules | 确认信息 |

## 能力等级 (SPECMATE_LEVEL)

通过环境变量控制信息返回量，适配不同开发场景：

| Level | 场景 | `preflight` | `check_style` | `lookup_error` | `lookup_example` |
|-------|------|-------------|---------------|----------------|------------------|
| **`silicon`** | 轻量速览 | TOP 3 错误 | 仅 error | 仅规则总结 | 1 文件 / 15 行 |
| **`wafer`** (默认) | 日常开发 | TOP 5 + 3 警告 | error + warning | 完整详情 | 3 文件 / 30 行 |
| **`tapeout`** | 深度审查 | TOP 10 + 全部警告 + 编码建议 | error + warning + hint | 完整详情 | 5 文件 / 50 行 |

配置方式：

```json
{
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["bsv-specmate"],
      "env": { "SPECMATE_LEVEL": "tapeout" }
    }
  }
}
```

## 独立开发模式

一个 Agent 同时负责编写和检查：

```
preflight() → 速览高频错误 + 警告

编写 .bsv 代码
    │
    ├─ 不确定语法 → lookup_ref / lookup_example
    │
    ▼
check_style 预检 → 按提示修复
    │
    ▼
编译 (bsc)
    │
    ├─ 通过 → 完成
    └─ 报错 → lookup_error(错误码)
                │
                ├─ 命中 → 按方案修复 → 重新编译
                └─ 未命中 → add_error(新错误) → 重新编译
```

## 协作开发模式

→ 详见 **[docs/collaboration.md](docs/collaboration.md)**

## 编译

### 检测 bsc 是否可用

```sh
bsc --version
```

### 有 bsc 环境 (WSL / Linux / Docker)

```sh
bsc -u -verilog -vdir verilog -bdir build bsv/Top.bsv
```

参数说明：
- `-u` — 只编译变更文件
- `-verilog` — 生成 Verilog
- `-vdir` — Verilog 输出目录
- `-bdir` — 编译中间文件目录

### 无 bsc 环境 (仅 Windows)

跳过编译环节，只依赖 `check_style` 做静态预检。如需完整编译，先在 WSL 中安装 bsc 或使用 Docker。

## 静态文档参考

以下文档仍可直接阅读：

| 文档 | 内容 | 何时读 |
|------|------|--------|
| `docs/BSV-STYLE.md` | 编码规范总则 | 首次使用 |
| `docs/checklist.md` | 编译前检查清单 | `check_style` 已覆盖，备用 |
| `docs/reference/` | BSV 语法参考 | `lookup_ref` 自动读，通常不需手动翻 |

## 数据存储

- **SQLite 知识库** → 位于 `~/.specmate/data/knowledge.db`
  - 可通过 `SPECMATE_DATA` 环境变量自定义路径
- **导出为文档** → `npm run db:export` 生成 `~/.specmate/docs/errors/*.md`
- **从文档重建** → `npm run db:seed` 将 `~/.specmate/docs/errors/` 重新导入

## 环境

- Bluespec Compiler version 2025.07
- 测试套件来源：B-Lang-org/bsc
- 用户数据默认路径：`~/.specmate/`
- 维护本仓库前先读 [docs/MAINTAINER.md](docs/MAINTAINER.md)
