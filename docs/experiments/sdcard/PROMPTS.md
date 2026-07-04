# SD 卡控制器 — CCB Goal 提示词

## 发给两个 Agent 的提示词（完全相同）

在 WSL 中启动 CCB，分别进入 `A/` 和 `B/`：

```bash
cd /mnt/d/Desktop/bsv-test/project-sdcard/A
ccb
```

CCB 窗口里输入：

```
/goal "实现 SD 卡控制器的全部 7 个模块。模块清单和接口约定在 AGENTS.md 中。每个模块写在 bsv/ 下，独立 package。全部写完即可。"
```

---

## 编译验证（全部完成后手动执行）

```bash
# Agent A
cd /mnt/d/Desktop/bsv-test/project-sdcard/A/bsv
for f in SpiPhy SdCmd SdResp SdData Crc7 SdCtrl Top; do
    echo "=== A / $f ==="
    bsc -u -verilog -g mk$f $f.bsv 2>&1 | grep -E "Error:|created"
done

# Agent B
cd /mnt/d/Desktop/bsv-test/project-sdcard/B/bsv
for f in SpiPhy SdCmd SdResp SdData Crc7 SdCtrl Top; do
    echo "=== B / $f ==="
    bsc -u -verilog -g mk$f $f.bsv 2>&1 | grep -E "Error:|created"
done
```

---

## 实验设计

| | A（对照组） | B（实验组） |
|---|---|---|
| 客户端 | CCB goal | CCB goal |
| AGENTS.md | 任务 + 6 条编码建议 | 任务 + Supervisor 角色 |
| MCP | ❌ | ✅ tapeout |
| 对比变量 | **静态规则 vs 动态知识引擎** |
