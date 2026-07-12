# specmate 项目记忆

> 最后更新：2026-07-11
> 维护者：specmate 负责人 + ops

## 项目背景

### 愿景
BSV 开发者的默认 AI 编码搭档——写出一次编译就通过的代码，而不是在编译报错上磨时间。

### 为什么做
BSV 太小众，AI 训练数据全是旧版本——`vec()` 已废弃照写，`priority` 是 SV 保留字也敢当变量名，Bool 拼进 Bit 表达式直接爆。同一个 G0004，换个 Agent 能踩三遍。每次编译报错都是一次性消耗品，没有记忆。

specmate 填的就是这个坑——**预编译拦截**，不在 Agent 摔倒后扶，在走路前喊"看路"。

### 核心理念
- **知识应该越用越强**：SQLite 命中计数，每次踩坑都让知识库强一分。不是一般静态文档能做到的
- **拦 > 修**：18 条规则编译前静态检查，不调 bsc 就能发现常见错误
- **角色 > 工具列表**：Agent 不用被教"你有 7 个工具"，一个 Supervisor 审查角色就能让它主动调用 10+ 次
- **话少 > 话多**：silicon 社恐模式靠"说最少的话"拿了最高分。正确时机说正确的话
- **不是编译器**：不加 bsc 进核心，保持轻量。有 WSL 的用户本来就有编译器

### 所属框架
specmate 是 **Kova**（领域知识引擎框架）在 BSV 领域的第一个实例。DKE 架构 x BSV 领域。

### 已验证效果（5 场对照实验）
- 编码时间：-47%（SD 卡控制器）
- 代码质量（盲审）：22/25 vs 19/25（CRC-32）
- 跨时钟域 SoC 盲审：**96.5/100**（silicon 社恐模式）vs 85.5（裸 Agent）
- UART：22/25 vs 16/25（specmate_bench 自动化框架）

## 当前状态

- **服务器**：运行中，端口 9339
- **SPECMATE_LEVEL**：develop（suggestive 模式）
- **数据库**：SQLite，含 30+ 错误码（P/T/G/BSV 系列）
- **最近分支**：master，HEAD `cf11c7a`（MCP 通知推送替代 WebSocket）

## 最近改动（2026-07-11）

### 已完成
- [x] **traps 分级** — 知识图谱 22 个节点的陷阱全部分为 hard/quality/style 三级
- [x] **通用陷阱层** — `_matcher.mjs` 新增 `UNIVERSAL_TRAPS`，match() 总是注入。当前只有 P0030
- [x] **encoder 范式修复** — `_patterns.mjs` 新增 encoder 模板（findIndex 骨架）
- [x] **encoder 陷阱修复** — 移除误导性的 foldl 手工遍历建议，改为 findIndex 推荐
- [x] **styles.md 修复** — Style 2 和 Style 4 的不良示范已替换

### 有修改未提交（6 个文件）
- `docs/reference/styles.md` — 风格示例替换
- `src/tools/_matcher.mjs` — traps 分级 + 通用陷阱层
- `src/tools/_matcher.test.mjs` — 测试更新
- `src/tools/_patterns.mjs` — encoder 范式
- `src/tools/preflight.mjs` — Bool/Bit 警告加强
- `src/tools/specmate_guide.mjs` — severity-aware 陷阱过滤

## 仓库与发布

### 双远程配置

| Remote | URL | 用途 | 权限 |
|--------|-----|------|------|
| `bsv-specmate-staging` | `https://github.com/Alele496/bsv-specmate-staging` | 私有开发仓库，日常推送目标 | 本人 |
| `bsv-specmate` | `https://github.com/Alele496/bsv-specmate` | 公开仓库（npm 包发布源） | 公开可读，本人可写 |

### 推送工作流

```
developer 完成修改 → reviewer PASS → ops 推 staging（bsv-specmate-staging）
  → 用户确认"可以推公开" → ops 推公开（bsv-specmate）
```

关键约束：
- **默认推 staging**，不可未经确认直接推公开
- **npm publish 需单独确认**——这是不可逆操作
- 两个 remote 的 master 分支应保持同步（staging 先，公开后）

### 提交规范

遵循 Armada 架构的提交约定：

```
Author: Alele496 <Alele496@users.noreply.github.com>

type: description

Co-Authored-By: 台阁 <armada@bsv-agent>
```

- 格式：conventional commits（`feat:`/`fix:`/`docs:`/`refactor:`/`test:`）
- 通过 ops agent 推送的提交尾部加 `Co-Authored-By: 台阁`，表示这是 Armada 架构协作产出
- 手工提交不需要 Co-Authored-By 尾部署名

### npm 包管理

| 字段 | 值 |
|------|-----|
| 包名 | `bsv-specmate` |
| 版本 | `0.1.0` |
| License | MIT |
| 入口 | `bin/server.mjs`（可全局安装 `npx bsv-specmate`） |
| 最低 Node.js | >= 18 |

**运行时依赖：**

| 包 | 版本 | 用途 |
|----|------|------|
| `@modelcontextprotocol/sdk` | ^1.9.0 | MCP 协议实现 |
| `sql.js` | ^1.12.0 | SQLite（编码记忆存储） |
| `tree-sitter` | ^0.25.0 | 语法树解析器 |
| `tree-sitter-bsv` | ^0.1.0 | BSV 语法定义 |

**npm 脚本：**

| 命令 | 用途 |
|------|------|
| `npm start` | 启动 MCP 服务器 |
| `npm test` | 运行测试（query / matcher / ast_query） |
| `npm run db:seed` | 从 Markdown 重建错误数据库 |
| `npm run db:export` | 导出数据库内容为 Markdown |
| `npm run health-check` | 健康检查脚本 |

**发布约束：**
- npm publish 是不可逆操作，需用户单独确认
- 发布前确保 staging 和公开仓库同步
- 当前版本 0.1.0 尚未发布到 npm registry

## 当前任务

### 进行中
- [ ] **提交 6 个未推送文件** — styles.md / _matcher.mjs / _matcher.test.mjs / _patterns.mjs / preflight.mjs / specmate_guide.mjs → reviewer 审查 → ops 推 staging
- [ ] **通用陷阱层扩展** — UNIVERSAL_TRAPS 目前只有 P0030，需分析 P0005/P0012/T0051 等是否应加入

### 计划中（短期）
- [ ] **preflight 接入 AST** — `ast_query.mjs` 能力完备但被动使用，需让 preflight 接受文件路径 → parse → 扫描已知错误模式（见 P0-1）
- [ ] **Agent B prompt 硬性约束** — 当前是"建议先调 specmate"，需改为"必须走 specmate 工具全部指南阶段"（见 P0-2）
- [ ] **P0030 知识库描述补全** — 补充 function 内 for 循环 return 的错误模式（见 P1-1）

### 计划中（中期）
- [ ] **16 个知识图谱节点补 style/pattern**
- [ ] **错误码 bsc 2025.07 兼容性审查** — P0005 "let 绑定" 建议在新版 bsc 中可能不可用（见 P2-1）
- [ ] **实验重跑** — 04-priority-encoder Round 3 → 验证通用陷阱层修复 → 继续 05~08

## 已知问题

### P0 - 致命
- [ ] **preflight 不做真正的代码检查** — 当前 `preflight()` 不接收文件路径，只是 dump 数据库高频错误。AST 解析器（`ast_query.mjs`）有完整的 tree-sitter 能力，但只用在 `on_error` 的事后上下文展示中。需要在 preflight 接入：parse 文件 → 遍历 AST → 扫描已知错误模式（如 function 内 for 循环有 return）
- [ ] **Agent B 不调用 specmate** — bench 实验显示：Agent B 收到 specmate 建议后，理解了概念但用自己的方式实现（如手写 findFirst 代替 findIndex），引入 specmate 不知道的 P0030 错误

### P1 - 重要
- [ ] **P0030 知识库描述不完整** — `preflight.mjs:111` 的 P0030 summarizeRule 说的是 "Value method 用 `= expr` 或 `? :` 三元链，不能用 if-return"，但没覆盖 "function 内 for 循环中 return" 的常见错误模式
- [ ] **通用陷阱层只含一条** — UNIVERSAL_TRAPS 目前只有 P0030，应该陆续加入其他跨领域 BSV 基础规则
- [ ] **16 个知识图谱节点缺乏 style/pattern** — 系统架构师在议会中提出的问题

### P2 - 改善
- [ ] errors.map 中的 P0005 "let 绑定" 建议在 bsc 2025.07 中不可用
- [ ] Agent B 的 prompt 需要强制"先调 specmate 再写代码"，而非建议

## 关键文件地图

| 文件 | 作用 | 谁改 |
|------|------|------|
| `bin/server.mjs` | MCP 服务器入口 | developer |
| `src/tools/_matcher.mjs` | 知识图谱（22 领域节点 + 通用陷阱） | developer |
| `src/tools/specmate_guide.mjs` | 核心工具：pre_code / on_error / continue / decide / pattern | developer |
| `src/tools/_patterns.mjs` | 代码范式模板（13 个） | developer |
| `src/tools/preflight.mjs` | 编译前检查（⚠ 当前不做真正的代码检查） | developer |
| `src/tools/ast_query.mjs` | tree-sitter BSV 解析器（能力完备，被动使用） | developer |
| `src/tools/check_style.mjs` | specmate_check 工具的后端 | developer |
| `src/tools/lookup_ref.mjs` | 参考文档查询 | developer |
| `src/db/query.mjs` | 错误数据库查询 | developer |
| `src/db/schema.mjs` | 数据库表结构 | developer |
| `src/config.mjs` | SPECMATE_LEVEL 配置 + LEVEL_LIMITS | developer |

## 设计决策及原因

1. **三级陷阱（hard/quality/style）**：Agent 分不清硬约束和软建议 → 选型时被 style 干扰 → 分三级，不同 mode 显示不同级
2. **通用陷阱层（UNIVERSAL_TRAPS）**：P0030 同时在 fsm/method 节点有声明，但 encoder 任务不匹配到这两个 → Agent 漏掉 P0030 → 改为不依赖关键词匹配的通用层
3. **preflight 不用 AST**：历史原因——preflight 最初设计为"快速预检"，只是数据库查表。现在 AST 能力完善了，该让它进 preflight
4. **findIndex 用 `\== (1)` 部分应用而不是 function lambda**：bsc 2025.07 不支持 `function` 关键字匿名 lambda（P0005）

## 实验数据

- 04-priority-encoder Round 1：Agent A 40% vs Agent B 35%（specmate 指导了错误模式）
- 04-priority-encoder Round 2：Agent A 100%（编译通过但代码用 Wire + put_val）vs Agent B P0030（代码更优雅但编译失败）
- 盲审结果：X (Agent A) 20/30 vs Y (Agent B) 24/30 — specmate 让代码"看起来更好"但编译挂
- 结论：specmate 的高层指导生效了（设计更优雅），但缺少编译前语法模式检查
