# 健康巡检

> 自动生成: 2026-07-07T09:18:58.538Z
> 综合评估: **HEALTHY**

## 总览

| 项目 | 状态 | 摘要 |
|------|------|------|
| Git 状态 | 🟡 | 6 未提交, 0 未推送 |
| 测试 | 🟢 | 13 passed, 0 failed |
| 数据库 | 🟢 | 12 条记忆, 2 未解决 |
| 依赖 | 🟢 | 所有依赖都是最新版本 |
| 文件 | 🟢 | 源文件检查完成 |

## Git 状态

- 🟡 6 个文件有未提交改动
- ⚪   bin/server.mjs
  docs/health-check.md
  package.json
  src/tools/lookup_ref.mjs
  src/tools/specmate_guide.mjs
  scripts/health-check.mjs

## 测试

  ...
1..6
# tests 13
# suites 6
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 529.8617

## 数据库

- 错误记忆库: 12 条
  G0010 — 跨 rule 方法调用冲突 (×17)
  G0004 — Rule 内并行写冲突 (×9)
  P0005 — 标识符与 BSV/SV 保留字冲突 (×8)
  P0032 — Methods must be at end of block (×3)
  T0051 — Literal 超出寄存器位宽 (×2)
- 未解决 capture: 2 条
  G0010 — G0010 scheduling conflict
  G0004 — Error: "test_ast_ctx.bsv", line 10, column 26: (G0004) some 
- 近期 capture: 10 条
  已解决: 8/10 (80%)
- Warning 快照: 0 个

## 依赖

- 所有依赖都是最新版本
- 无已知安全漏洞

## 文件

- 最近 7 天无源文件修改
- 上次巡检: 0 小时前

## 建议操作

- 🟡 有未提交的改动，考虑 `git add` + `git commit`
- 📋 下次自动巡检由 Cron 触发
