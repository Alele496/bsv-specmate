# 协作开发模式

## 角色分工

| 角色 | 职责 | specmate 使用 |
|------|------|-------------|
| **Supervisor Agent** | 项目分解、技术路线、接口定义、代码审查 | 审查前 `check_style`，报错后 `lookup_error`，不确定语法时 `lookup_ref` |
| **Developer Agent** | 按任务实现模块、编译调试 | 编码前 `coding_rules()`，视需要 `lookup_ref` / `lookup_example` |

## Developer 项目模板

Developer Agent 的工作目录下放置一个极简 AGENTS.md：

```markdown
# {项目名称}

{项目描述}

## 模块清单
{模块表格或列表}

## 接口约定
{接口规范}

代码写在 bsv/ 下。
```

同时放置 opencode.json 加载 specmate MCP。

当 Developer Agent 第一次调用 `coding_rules()` 时，specmate 会自动返回工具列表和使用提示，
Agent 自然了解如何查阅 BSV 语法规范和常见错误。

## Supervisor 工作流

Supervisor Agent 负责分阶段派发任务：

```
Phase 1: 基础模块 (BootROM, Timer, GPIO)
    │
    ├─ 发送任务描述 → Developer Agent
    ├─ 等待编译结果
    ├─ 有错：check_style 复核 → lookup_error 查方案 → 反馈 Developer
    └─ 通过 → 审查代码质量
        │
    Phase 2: 接口模块 (UART)
    Phase 3: 互连集成 (Wishbone Interconnect)
    Phase 4: DMA + Top 集成
```

Supervisor 使用 specmate 进行代码审查而非修改。

## 独立开发模式

单一 Agent 负责编写和审查，使用同一个 AGENTS.md 模板。
Agent 第一次调用 `coding_rules()` 时收到完整工具列表，按需使用。

---

### 模板文件

| 文件 | 用途 |
|------|------|
| `{项目}/AGENTS.md` | Developer 极简模板（任务 + 接口约定） |
| `{项目}/opencode.json` | MCP 配置加载 specmate |
| 参考：`bsv-test/project-periph/B/` | 实际例子 |
