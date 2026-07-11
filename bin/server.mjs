#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import { z } from "zod";

import { checkStyle } from "../src/tools/check_style.mjs";
import { guide } from "../src/tools/specmate_guide.mjs";
import { learn } from "../src/tools/specmate_learn.mjs";
import { getLevel, LEVEL_LIMITS } from "../src/config.mjs";
import { hitError, addCapture, getLatestCaptureByCode, queryCapturesByCode, resolveCaptureById, saveWarningSnapshot, diffWarnings, queryLatestSnapshots } from "../src/db/query.mjs";
import { parseBSCWarnings } from "../src/tools/warning_diff.mjs";
import { parseFile, extractAll, analyzeScheduling, buildCallGraph, buildDependencyGraph, findConflictPairs, extractMethods, extractRegWrites, extractRegDeclarations, queryNodeAt, analyzeRuleConflicts, analyzeMethodOrder, findImplicitConflicts } from "../src/tools/ast_query.mjs";
import { extractKeywords, match as matchKeywords } from "../src/tools/_matcher.mjs";
import { init as initNotify } from "../src/notify.mjs";
import * as alerts from "../src/push/alerts.mjs";

const server = new McpServer({
    name: "bsv-specmate",
    version: "0.2.0-dev",
});

server.tool(
    "specmate_guide",
    "Call BEFORE writing any BSV module (phase=pre_code) — like checking the weather before heading out. Returns traps, coding memories, and references for your task. Also call when: compilation fails (phase=on_error), unsure between two approaches (phase=decide), ready for the next module (phase=continue), or need a standard code skeleton (phase=pattern).",
    {
        phase: z.enum(["pre_code", "on_error", "continue", "decide", "pattern"])
            .describe("When you are: pre_code=about to write a module | on_error=compilation failed with error code | continue=writing next module | decide=choosing between two approaches | pattern=need a standard module skeleton"),
        input: z.string().describe("Brief: task description (pre_code) | error code (on_error) | next task (continue) | two options (decide) | what module (pattern)"),
    },
    async ({ phase, input }) => {
        const result = await guide({ phase, input });

        // Push alerts: extract traps from pre_code and pattern phases
        if (phase === 'pre_code' || phase === 'pattern') {
            try {
                const keywords = extractKeywords(input);
                const m = matchKeywords(keywords);
                if (m.traps.length > 0) {
                    const trapItems = m.traps.slice(0, 5).map(t => ({ level: 'warn', title: t, detail: t }));
                    if (phase === 'pattern') {
                        alerts.onPattern(trapItems, input);
                    } else {
                        alerts.onPreCode(trapItems, input);
                    }
                }
            } catch (_) { /* push is non-critical */ }
        }

        // Push on_error alert (gated by pushOnError flag in alerts.mjs)
        if (phase === 'on_error') {
            try {
                const codePattern = /\b([GPTBS]\d{4})\b/g;
                const errCodes = [...new Set([...input.matchAll(codePattern)].map(m => m[1]))];
                alerts.onCapture(errCodes);
            } catch (_) { /* push is non-critical */ }
        }

        return { content: [{ type: "text", text: result }] };
    }
);

server.tool(
    "specmate_check",
    "Run static checks on .bsv files. By default runs 3 high-precision checks (literal overflow, zero-width literal, Bool misuse). Set full=true to run all checks including regex-based ones.",
    {
        files: z.array(z.string()).describe("要检查的 .bsv 文件路径列表"),
        full: z.boolean().optional().default(false).describe("设为 true 运行全部检查（含正则类，误报率较高）。默认只运行 3 项高精度检查。"),
    },
    async ({ files, full }) => {
        const level = getLevel();
        const cfg = LEVEL_LIMITS[level];
        const results = checkStyle({ files, full });

        // Push alerts for issues found
        if (results.length > 0) {
            try { alerts.onCheckStyle(results, files); } catch (_) {}
        }

        // Auto-count: every check_style hit increments the error's count
        [...new Set(results.map(r => r.check))].forEach(c => hitError(c).catch(err => console.error('[specmate] hitError failed:', err.message)));

        if (results.length === 0) {
            const msg = cfg.collabHint
                ? "没有发现问题。写得好。继续的话调 specmate_guide(phase=\"continue\")。"
                : "没有发现问题。";
            return { content: [{ type: "text", text: msg }] };
        }

        const text = results.map(r =>
            `[${r.check}] ${r.file}:${r.line} — ${r.message}\n  建议: ${r.suggestion}`
        ).join("\n\n");

        const parts = [`发现 ${results.length} 个问题:\n\n${text}`];

        if (cfg.crossRef) {
            const hooks = [];
            const checks = [...new Set(results.map(r => r.check))];
            const topicHints = {
                P0032: "module", P0030: "module", P0005: "keywords", T0011: "keywords",
                T0061: "types", T0060: "types", T0051: "types", T0132: "types",
                G0004: "schedule", G0004_FSM: "schedule", G0010: "schedule",
                G0030: "schedule", G0040: "schedule",
                T0004: "stdlib", T0016: "structs", P0073: "module",
                P0085: "attributes", G0054: "attributes", T0080: "module",
                T0144: "unions",
            };
            for (const c of checks) {
                if (topicHints[c]) {
                    hooks.push(`specmate_guide(phase="decide", input="${c} 怎么修")`);
                }
            }
            if (hooks.length > 0) {
                parts.push(`\n💡 不确定怎么修? 调 ${hooks[0]}`);
            }
        }

        if (cfg.collabHint) {
            parts.push("\n💬 修完后可以再检查一次。写下一部分时调 specmate_guide(phase=\"continue\")。");
        }

        return { content: [{ type: "text", text: parts.join("") }] };
    }
);

server.tool(
    "specmate_learn",
    "Only when specmate_guide(phase=on_error) says an error code is not yet known. Stores it in SQLite so the same pitfall is blocked next time. You write it once, specmate remembers forever.",
    {
        code: z.string().describe("错误码, 如 'P0005' 或 'G0010'"),
        title: z.string().describe("简短标题, 如 'Methods must be at end of block'"),
        bsc_output: z.string().describe("bsc 编译器原始错误输出"),
        cause: z.string().describe("根因分析"),
        solution: z.string().describe("修复方案, 含代码示例"),
        rules: z.string().optional().describe("通用预防规则"),
    },
    async ({ code, title, bsc_output, cause, solution, rules }) => {
        const result = await learn({ code, title, bsc_output, cause, solution, rules: rules || "" });
        return { content: [{ type: "text", text: result }] };
    }
);

server.tool(
    "specmate_capture",
    "Feed raw bsc compiler output. specmate auto-parses error codes and saves context for project memory. Use when compilation produces errors — no need to manually call specmate_learn, just capture first.",
    {
        bsc_output: z.string().describe("bsc 编译器的完整输出 (stdout+stderr)"),
        files: z.array(z.string()).optional().describe("当前编译相关的 .bsv 文件路径"),
    },
    async ({ bsc_output, files }) => {
        // Parse all error codes from bsc output
        const codePattern = /\b([GPTBS]\d{4})\b/g;
        const codes = [...new Set([...bsc_output.matchAll(codePattern)].map(m => m[1]))];

        if (codes.length === 0) {
            // Try to find error-like patterns even without standard codes
            const hasError = /error|warning/i.test(bsc_output);
            if (hasError) {
                addCapture({ code: "UNKNOWN", bsc_output, files: files?.join(", ") }).catch(err => console.error('[specmate] addCapture(UNKNOWN) failed:', err.message));
                return { content: [{ type: "text", text: "未识别出标准错误码，已以 UNKNOWN 暂存。如果是新错误类型，用 specmate_learn 手动录入。" }] };
            }
            return { content: [{ type: "text", text: "未在输出中检测到编译错误码。" }] };
        }

        // Fire-and-forget capture for each unique error code
        for (const code of codes) {
            addCapture({ code, bsc_output, files: files?.join(", ") }).catch(err => console.error('[specmate] addCapture failed:', err.message));
        }

        // Push alerts for captured errors
        if (codes.length > 0) {
            try { alerts.onCapture(codes); } catch (_) {}
        }

        const list = codes.map(c => `  • ${c}`).join('\n');
        const unresolvedMsg = codes.length === 1
            ? `错误码 ${codes[0]} 已记录。修好后调 specmate_resolve(code="${codes[0]}", cause="...", solution="...") 保存经验。`
            : `共 ${codes.length} 个错误码已记录:\n${list}\n\n修好后逐条调 specmate_resolve 保存修复经验。`;

        return { content: [{ type: "text", text: unresolvedMsg }] };
    }
);

server.tool(
    "specmate_resolve",
    "Call AFTER you fix a compilation error. Records the cause and solution, linking to the most recent capture. This is how specmate learns from your fixes — the project memory grows with every resolve.",
    {
        code: z.string().describe("错误码, 如 'G0004'"),
        cause: z.string().describe("根因: 为什么会出现这个错误"),
        solution: z.string().describe("修复方案: 怎么改的, 改了什么"),
    },
    async ({ code, cause, solution }) => {
        const capture = await getLatestCaptureByCode(code);
        if (!capture) {
            return { content: [{ type: "text", text: `没有找到 ${code} 的未解决记录。可能已经被 resolve 过了。` }] };
        }
        await resolveCaptureById(capture.id, { cause, solution });

        // Push memory alert if this error has history
        try {
            const history = await queryCapturesByCode(code, 10);
            if (history.length > 1) {
                await alerts.onResolve(code, cause, solution,
                    async (c) => ({ count: history.length, history: `出现过 ${history.length} 次` })
                );
            }
        } catch (_) { /* non-critical */ }

        return { content: [{ type: "text", text: `✅ ${code} 已标记为已解决。原因和方案已记录。` }] };
    }
);

server.tool(
    "specmate_analyze",
    "Parse BSV files with a real AST and answer structural questions. Ask about: scheduling conflicts in rules, module call/dependency graphs, register usage across rules, method implementations, or analyze specific lines of code. Use when you need to understand how rules/methods/modules interact — things that require actually parsing BSV syntax rather than regex matching.",
    {
        files: z.array(z.string()).describe("要分析的 .bsv 文件路径列表"),
        question: z.string().describe("想问什么？如 '调度冲突分析' / '模块依赖图' / 'rule 调用关系' / '寄存器读写分析' / '第156行是什么'"),
    },
    async ({ files, question }) => {
        const q = (question || '').toLowerCase();

        if (files.length === 0) {
            return { content: [{ type: "text", text: "请至少提供一个 .bsv 文件路径。" }] };
        }

        // Parse all files
        const parsed = files.map(f => ({ file: f, result: parseFile(f) }));
        const failed = parsed.filter(p => !p.result);
        const ok = parsed.filter(p => p.result);

        if (ok.length === 0) {
            return { content: [{ type: "text", text: `无法解析任何文件: ${failed.map(p => p.file).join(', ')}` }] };
        }

        // ── Routing ──

        // Scheduling / conflict analysis
        if (/调度|冲突|conflict|schedule|scheduling|G0004|G0010/.test(q)) {
            const lines = [];
            for (const { file, result } of ok) {
                const sched = analyzeScheduling(result.tree, result.source, file);
                const conflicts = findConflictPairs(result.tree, result.source, file);

                if (sched.length === 0 && conflicts.length === 0) {
                    lines.push(`**${file}**: 未发现 rule，或无需分析调度。`);
                    continue;
                }

                lines.push(`## ${file}`);
                lines.push('');
                lines.push('| Rule | 行 | 子模块数 | 子模块 | 风险 |');
                lines.push('|------|----|---------|--------|------|');
                for (const s of sched) {
                    const subs = s.submodules.join(', ') || '—';
                    const riskIcons = { critical: '🔴 CRIT', high: '🟠 HIGH', medium: '🟡 MED', low: '🟢 LOW', none: '⚪ NONE' };
                    const riskIcon = riskIcons[s.risk] || s.risk;
                    lines.push(`| ${s.rule} | ${s.line} | ${s.touchesSubmodules} | ${subs} | ${riskIcon} |`);
                }

                if (conflicts.length > 0) {
                    lines.push('');
                    lines.push('### ⚠ 同 rule 内多次写入:');
                    for (const c of conflicts) {
                        lines.push(`- **${c.rule}**: 寄存器 \`${c.reg}\` 在第 ${c.lines.join(', ')} 行被写入多次 → 可能触发 G0004`);
                    }
                }

                // Show method calls per rule
                for (const s of sched) {
                    if (s.methodCalls.length > 0) {
                        lines.push('');
                        lines.push(`**${s.rule}** 内的方法调用:`);
                        for (const mc of s.methodCalls) {
                            lines.push(`- \`${mc.target}.${mc.method}\` (行 ${mc.line})`);
                        }
                    }
                }
                lines.push('');
            }

            // Push scheduling conflict alerts
            try {
                for (const { file } of ok) {
                    const pf = parseFile(file);
                    if (!pf) continue;
                    const schedForAlert = analyzeScheduling(pf.tree, pf.source, file);
                    const conflictsForAlert = findConflictPairs(pf.tree, pf.source, file);
                    const allConflicts = [
                        ...schedForAlert.filter(s => s.risk === 'critical' || s.risk === 'high')
                            .map(s => ({ type: 'rule', rule: s.rule, severity: s.risk, detail: `Rule ${s.rule} 操作 ${s.touchesSubmodules} 个子模块` })),
                        ...conflictsForAlert
                            .map(c => ({ type: 'within-rule', rule: c.rule, severity: 'high', detail: `寄存器 ${c.reg} 在 ${c.rule} 内被多次写入` })),
                    ];
                    if (allConflicts.length > 0) {
                        alerts.onAnalyzeConflicts(allConflicts, file);
                    }
                }
            } catch (_) { /* non-critical */ }

            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // ── NEW B5 routes ──

        // Cross-rule conflict matrix
        if (/冲突矩阵|conflict.*matrix|cross.*rule/.test(q)) {
            const lines = [];
            for (const { file, result } of ok) {
                const cr = analyzeRuleConflicts(result.tree, result.source, file);
                if (cr.rules.length === 0) {
                    lines.push(`**${file}**: 未发现 rule。`);
                    continue;
                }
                lines.push(`## ${file} — 跨 Rule 冲突矩阵`);
                lines.push(`Rules: ${cr.rules.join(', ')}`);
                if (cr.conflicts.length === 0) {
                    lines.push('');
                    lines.push('未发现跨 rule 冲突。');
                } else {
                    lines.push('');
                    lines.push('| Rule A | Rule B | 类型 | 严重度 | 详情 |');
                    lines.push('|--------|--------|------|--------|------|');
                    for (const c of cr.conflicts) {
                        const sevIcons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
                        const icon = sevIcons[c.severity] || '';
                        lines.push(`| ${c.rule1} | ${c.rule2} | ${c.type} | ${icon} ${c.severity} | ${c.detail} |`);
                    }
                }
                lines.push('');
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // Method call order
        if (/方法.*顺序|method.*order|enq.*deq|并发.*调用/.test(q)) {
            const lines = [];
            for (const { file, result } of ok) {
                const mo = analyzeMethodOrder(result.tree, result.source, file);
                if (mo.length === 0) {
                    lines.push(`**${file}**: 未发现同一 rule 内同一子模块被多次调用。`);
                } else {
                    lines.push(`## ${file} — 方法调用顺序分析`);
                    for (const item of mo) {
                        lines.push(`- **${item.rule}** (行 ${item.line}): 子模块 \`${item.target}\` 被调用 ${item.calls.length} 次`);
                        for (const c of item.calls) {
                            lines.push(`  - \`${c.method}\` (行 ${c.line})`);
                        }
                    }
                }
                lines.push('');
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // Implicit conflicts
        if (/隐式|wire.*冲突|implicit|多写/.test(q)) {
            const lines = [];
            for (const { file, result } of ok) {
                const ic = findImplicitConflicts(result.tree, result.source, file);
                if (ic.length === 0) {
                    lines.push(`**${file}**: 未发现 Wire 隐式冲突。`);
                } else {
                    lines.push(`## ${file} — Wire 隐式冲突`);
                    lines.push('');
                    lines.push('| Wire | 行 | 写入者 | 风险 |');
                    lines.push('|------|----|--------|------|');
                    for (const w of ic) {
                        lines.push(`| ${w.wire} | ${w.line} | ${w.writtenBy.join(', ')} | ${w.risk} |`);
                    }
                }
                lines.push('');
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // Dependency analysis
        if (/依赖|dependency|影响|impact|dep|依赖图/.test(q)) {
            const dg = buildDependencyGraph(files);
            const lines = [];
            lines.push('## 模块依赖图');
            lines.push('');
            lines.push('### 模块');
            for (const m of dg.modules) {
                lines.push(`- \`${m.name}\` (${m.file}:${m.line})`);
            }
            lines.push('');
            lines.push('### 依赖关系');
            if (dg.deps.length === 0) {
                lines.push('(无子模块实例化)');
            } else {
                for (const d of dg.deps) {
                    lines.push(`- \`${d.from}\` → \`${d.to}\` (via \`${d.via}\`, ${d.file})`);
                }
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // Call graph
        if (/调用|call|graph|调用图/.test(q)) {
            const cg = buildCallGraph(files);
            const lines = [];
            lines.push('## 调用图');
            lines.push('');
            lines.push(`节点: ${cg.nodes.length}, 边: ${cg.edges.length}`);
            lines.push('');
            lines.push('### 实例化');
            for (const e of cg.edges.filter(e => e.type === 'instantiates')) {
                lines.push(`- \`${e.from}\` instantiates \`${e.to}\` (${e.file}:${e.line})`);
            }
            lines.push('');
            lines.push('### 方法调用');
            const callEdges = cg.edges.filter(e => e.type === 'calls');
            if (callEdges.length === 0) {
                lines.push('(无子模块方法调用)');
            } else {
                for (const e of callEdges) {
                    lines.push(`- \`${e.from}\` calls \`${e.to}\` (${e.file}:${e.line})`);
                }
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // Register analysis
        if (/寄存器|register|reg|读写|write|read/.test(q) && !/调度|冲突|conflict/.test(q)) {
            const lines = [];
            for (const { file, result } of ok) {
                const regs = extractRegDeclarations(result.tree, result.source, file);
                const writes = extractRegWrites(result.tree, result.source, file);

                if (regs.length === 0) {
                    lines.push(`**${file}**: 未发现寄存器声明。`);
                    continue;
                }

                lines.push(`## ${file}`);
                lines.push('');
                lines.push('| 寄存器 | 类型 | 行 | 写入者 |');
                lines.push('|--------|------|----|--------|');
                for (const r of regs) {
                    const writers = writes
                        .filter(w => w.reg === r.name)
                        .map(w => w.ruleName || 'method')
                        .filter((v, i, a) => a.indexOf(v) === i) // unique
                        .join(', ');
                    lines.push(`| ${r.name} | ${r.type} | ${r.line} | ${writers || '—'} |`);
                }
                lines.push('');
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // Method analysis
        if (/方法|method/.test(q)) {
            const lines = [];
            for (const { file, result } of ok) {
                const methods = extractMethods(result.tree, result.source, file);
                if (methods.length === 0) continue;
                lines.push(`## ${file}`);
                lines.push('');
                lines.push('| 方法 | 类型 | 行 | 所属模块 |');
                lines.push('|------|------|----|----------|');
                for (const m of methods) {
                    const kind = m.isValue ? 'ActionValue' : m.isAction ? 'Action' : 'value';
                    lines.push(`| ${m.name} | ${kind} | ${m.line} | ${m.moduleName || '—'} |`);
                }
                lines.push('');
            }
            if (lines.length === 0) {
                lines.push('未找到 method 实现。');
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        // Line/position query: "第156行" / "line 156" (check after content routes)
        const lineMatch = q.match(/(?:第\s*|\bline\s*|行\s*)(\d+)(?:\s*[行:：]\s*(\d+))?/);
        if (lineMatch) {
            const line = parseInt(lineMatch[1], 10);
            const col = lineMatch[2] ? parseInt(lineMatch[2], 10) : 1;
            const pf = ok[0].result;
            const node = queryNodeAt(pf.tree, pf.source, line, col);
            if (!node) {
                return { content: [{ type: "text", text: `${ok[0].file}:${line}:${col} — 该位置没有找到 AST 节点。` }] };
            }
            const ancestors = node.ancestors.map(a => `  ${a.type}: ${a.text}`).join('\n');
            return { content: [{ type: "text", text:
                `**${ok[0].file}:${node.line}:${node.col}** — \`${node.type}\`\n` +
                `\`\`\`\n${node.text}\n\`\`\`\n\n` +
                `祖先节点:\n${ancestors}`
            }] };
        }

        // Default: full extraction summary
        const lines = [];
        for (const { file, result } of ok) {
            const all = extractAll(file);
            if (all.error) { lines.push(`**${file}**: ${all.error}`); continue; }

            lines.push(`## ${file}`);
            lines.push(`- ${all.modules.length} 个模块: ${all.modules.map(m => m.name).join(', ') || '(无)'}`);
            lines.push(`- ${all.rules.length} 条规则: ${all.rules.map(r => r.name).join(', ') || '(无)'}`);
            lines.push(`- ${all.methods.length} 个方法: ${all.methods.map(m => m.name).join(', ') || '(无)'}`);
            lines.push(`- ${all.submodules.length} 个子模块实例`);
            lines.push(`- ${all.registers.length} 个寄存器`);
            lines.push(`- ${all.calls.length} 个函数/方法调用`);
            lines.push(`- ${all.regWrites.length} 个寄存器写入`);
            if (all.conflicts.length > 0) {
                lines.push(`- ⚠ ${all.conflicts.length} 个潜在冲突`);
            }
            lines.push('');
        }
        lines.push('---');
        lines.push('用 specmate_analyze(question="调度冲突分析" | "模块依赖图" | "调用图" | "寄存器分析" | "第N行") 获取详细分析。');
        return { content: [{ type: "text", text: lines.join('\n') }] };
    }
);

server.tool(
    "specmate_diff",
    "追踪 BSC 编译 warning 变化。支持两种模式：1) 提交 BSC 输出来存储快照；2) 对比最近两次快照的 warning 差异。用于编译-修复迭代中追踪哪些 warning 是新增的、哪些已消除。",
    {
        bsc_output: z.string().optional().describe("BSC 编译的 stdout/stderr 输出"),
        action: z.enum(["snapshot", "diff"]).describe("snapshot: 存储本次编译的 warning; diff: 对比最近两次快照"),
    },
    async ({ bsc_output, action }) => {
        if (action === 'snapshot') {
            if (!bsc_output) {
                return { content: [{ type: "text", text: "snapshot 模式需要 bsc_output 参数。" }] };
            }
            const warnings = parseBSCWarnings(bsc_output);
            if (warnings.length === 0) {
                return { content: [{ type: "text", text: "未在 BSC 输出中解析到 warning/error。" }] };
            }
            const snapshotId = `snap_${Date.now()}`;
            await saveWarningSnapshot(snapshotId, warnings);
            return { content: [{ type: "text", text: `快照 ${snapshotId} 已存储，包含 ${warnings.length} 个 warning。` }] };
        }
        if (action === 'diff') {
            const snapshots = await queryLatestSnapshots(2);
            if (snapshots.length < 2) {
                return { content: [{ type: "text", text: `仅有 ${snapshots.length} 个快照，需要至少 2 个才能对比。先用 action=snapshot 存储编译输出。` }] };
            }
            const [curr, prev] = snapshots;
            const result = await diffWarnings(prev.snapshot_id, curr.snapshot_id);

            // Push diff alerts
            try { alerts.onDiff(result); } catch (_) {}

            const lines = [];
            lines.push(`## Warning Diff: ${prev.snapshot_id} → ${curr.snapshot_id}`);
            lines.push('');
            lines.push(`- 新增: ${result.added.length}`);
            lines.push(`- 消除: ${result.removed.length}`);
            lines.push(`- 持续: ${result.persistent.length}`);
            if (result.added.length > 0) {
                lines.push('');
                lines.push('### 新增');
                for (const w of result.added) {
                    lines.push(`- \`${w.code}\` ${w.file}:${w.line} — ${w.message}`);
                }
            }
            if (result.removed.length > 0) {
                lines.push('');
                lines.push('### 已消除');
                for (const w of result.removed) {
                    lines.push(`- \`${w.code}\` ${w.file}:${w.line} — ${w.message}`);
                }
            }
            if (result.persistent.length > 0) {
                lines.push('');
                lines.push('### 持续存在');
                for (const w of result.persistent) {
                    lines.push(`- \`${w.code}\` ${w.file}:${w.line} — ${w.message}`);
                }
            }
            return { content: [{ type: "text", text: lines.join('\n') }] };
        }
        return { content: [{ type: "text", text: "未知 action。支持 snapshot 和 diff。" }] };
    }
);

const TRANSPORT = (process.env.SPECMATE_TRANSPORT || 'streamable-http').toLowerCase();

if (TRANSPORT === 'stdio') {
  // stdio fallback — keep existing behavior
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[specmate] MCP stdio transport ready');
} else {
  // Streamable HTTP — supports bidirectional communication + SSE push
  const PORT = parseInt(process.env.SPECMATE_PORT || '9339', 10);
  const httpServer = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  // Bind MCP connection to POST /mcp
  httpServer.on('request', async (req, res) => {
    // CORS — allow CCB cross-origin connections
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', transport: 'streamable-http' }));
      return;
    }

    // MCP requests route to /mcp
    if (req.url === '/mcp' || req.url?.startsWith('/mcp')) {
      await transport.handleRequest(req, res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await server.connect(transport);
  await new Promise((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(PORT, '127.0.0.1', resolve);
  });
  console.error(`[specmate] MCP Streamable HTTP on http://127.0.0.1:${PORT}/mcp`);
}

// Initialize MCP notification bridge — replaces WebSocket push
initNotify(server.server);
