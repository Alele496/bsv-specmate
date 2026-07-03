# BSV Agent — Bluespec 编码辅助工具

> 目标：帮助 AI Agent 编写正确的 BSV (Bluespec SystemVerilog) 代码，减少编译错误。

## 工作流

### 写代码前

1. **读 `docs/checklist.md`** — 编译前自检清单（高频错误浓缩，<50 行）
2. 不确定语法用法 → 搜索 `examples/bsv/` 中的官方测试套件用例

### 编译报错后

1. **查 `docs/errors/INDEX.md`** — 索引表找错误码
2. 命中 → 读对应 `docs/errors/<CODE>.md` → 按方案修复 → 给条目次数 +1
3. 未命中 → 修复后追加新条目
4. 同类错误合并到同一条目，不拆多条

### 不确定规范时

- 读 `docs/reference/` 对应小节（模块语法、类型系统、常见模式等）
- 搜 `examples/bsv/` 看官方用例怎么写

## 文件结构

```
bsv-agent/
├── AGENTS.md                  ← 你正在读的文件（路由入口）
├── package.json               ← npm 包，AID 脚本
├── docs/
│   ├── BSV-STYLE.md           ← 编码规范（必读，短）
│   ├── checklist.md           ← 编译前检查清单（必读，短）
│   ├── errors/                ← 错题本（按需读）
│   │   ├── INDEX.md           ← 索引表（错误码 → 文件名 → 次数）
│   │   └── <CODE>.md          ← 单条错误详情
│   └── reference/             ← BSV 规范摘录（按需读）
│       ├── module.md          ← 模块/接口/rule/method 语法
│       ├── types.md           ← 类型系统 (Bit, Bool, Int, enum, struct)
│       ├── syntax.md          ← 常见语法模式与陷阱
│       └── examples.md        ← 如何使用 examples/ 参考库
└── examples/
    ├── bsv/                   ← BSC 官方测试套件 (4,570 .bsv 文件)
    └── bs/                    ← Bluespec Classic 旧语法（仅供参考，不推荐）
```

## 编译命令

```sh
bsc -u -verilog -vdir verilog -bdir build bsv/Top.bsv
```

## 环境

- Bluespec Compiler version 2025.07
- 测试套件来源：B-Lang-org/bsc
