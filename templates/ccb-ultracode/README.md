# specmate 协作开发模板

## 三种使用方式

### 方式 1：Claude Code 单人 + specmate

适合：小改动、简单模块、快速跑通。

直接用 `AGENTS.md` 模板——specmate 定位为"BSV 搭档"，Agent 拿不准的时候问它，不用每步都调。

一行式 prompt：
```
Goal: {任务描述}。BSV 编码，specmate 当搭档。不确定的 BSV 语法/调度/接口问题先查它再写。
```

### 方式 2：CCB/Ultracode 多 Agent 协作

适合：大项目、新模块、追求代码质量。

- **bsv-coder** — 只写 BSV，不知道 specmate
- **bsv-reviewer** — 只审查，内置 specmate（check → decide → 反馈修复 → 重检循环）
- **bsv-dev workflow** — 编排 Coder → Review → Fix 自动循环

用户只需描述需求，Agent 们自动协作完成。

### 方式 3：自定义组合

按需选用以下模板：

| 模板 | 文件 | 用途 |
|------|------|------|
| Coder 角色 | `agents/bsv-coder.md` | 专职 BSV 编码 |
| Reviewer 角色 | `agents/bsv-reviewer.md` | specmate 审查 |
| 协作工作流 | `workflows/bsv-dev.js` | Coder + Reviewer 自动循环 |
| 用户提示词 | `user-prompts.md` | 硬件工程师参考 |
| 顾问角色 | `agents/advisor.md` | 分析讨论 |

### 文件清单

```
templates/ccb-ultracode/
├── README.md              # 本文件
├── user-prompts.md        # 用户提示词模板
├── agents/
│   ├── bsv-coder.md       # BSV 编码 Agent
│   ├── bsv-reviewer.md    # BSV 审查 Agent（内置 specmate）
│   └── advisor.md         # 顾问 Agent
└── workflows/
    ├── bsv-dev.js         # Coder + Reviewer 协作工作流
    └── spec-orchestrator.js  # 执行总管路由
```
