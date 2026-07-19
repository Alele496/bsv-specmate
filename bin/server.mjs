#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import { z } from "zod";

import { checkStyle } from "../src/tools/check_style.mjs";
import { guide, scan } from "../src/tools/specmate_guide.mjs";
// specmate_learn.mjs import removed — deprecated. add_error.mjs retained for db:seed script only.
import { getLevel, LEVEL_LIMITS } from "../src/config.mjs";
import { hitError, addCapture, getLatestCaptureByCode, queryCapturesByCode, resolveCaptureById, saveWarningSnapshot, diffWarnings, queryLatestSnapshots, ensureSession, getSessionId, endCurrentSession, querySessionStats, queryStubbornErrors, queryFixRate, queryErrorCodeStats, queryTopErrorCodes, queryUnresolvedCount, getCurrentSessionPhase, setCurrentSessionPhase } from "../src/db/query.mjs";
import { resolvePhase } from "../src/elicitation/elicit-phase.mjs";
import { parseBSCWarnings } from "../src/tools/warning_diff.mjs";
import { diagnose } from "../src/tools/specmate_diagnose.mjs";
import { parseFile, extractAll, analyzeScheduling, buildCallGraph, buildDependencyGraph, findConflictPairs, extractMethods, extractRegWrites, extractRegDeclarations, queryNodeAt, analyzeRuleConflicts, analyzeMethodOrder, findImplicitConflicts } from "../src/tools/ast_query.mjs";
import { existsSync } from "fs";
import { isAbsolute } from "path";
import { extractKeywords, match as matchKeywords } from "../src/tools/_matcher.mjs";
import { init as initNotify } from "../src/notify.mjs";
import * as alerts from "../src/push/alerts.mjs";

/**
 * 校验文件路径：必须是绝对路径，且文件必须存在。
 * 返回 { valid: true } 或 { valid: false, error: "PATH_NOT_ABSOLUTE: ..." | "FILE_NOT_FOUND: ..." }
 */
function validateFilePaths(files) {
    for (const f of files) {
        if (!isAbsolute(f)) {
            return {
                valid: false,
                error: `PATH_NOT_ABSOLUTE: 请提供绝对路径，当前收到的路径：'${f}'。建议使用 <workspace>/bsv/xxx.bsv 格式。`
            };
        }
        if (!existsSync(f)) {
            return {
                valid: false,
                error: `FILE_NOT_FOUND: 文件 '${f}' 不存在。`
            };
        }
    }
    return { valid: true };
}

const server = new McpServer({
    name: "bsv-specmate",
    version: "0.2.0-dev",
});

server.tool(
    "specmate_guide",
    "分阶段指导。pre_code=编码前硬约束+AST扫描，on_error=按错误码查修复方案，pattern=代码骨架。注意：decide 已关闭。on_error 仅匹配标准错误码 [GPTBS]\\d{4}，BSC 内部错误无法诊断。",
    {
        phase: z.enum(["pre_code", "on_error", "continue", "decide", "pattern"])
            .describe("pre_code=准备写模块 | on_error=编译失败，传错误码 | continue=继续下一模块 | pattern=获取代码骨架。decide 已关闭（返回不可用提示）。"),
        input: z.string().describe("Brief: task description (pre_code) | error code (on_error) | next task (continue) | two options (decide) | what module (pattern)"),
        file: z.string().optional().describe("Optional .bsv file path. When set with pre_code, specmate runs AST preflight scan on the file and embeds results in the response — catches P0030/P0005/T0043/G0053/G0005 without bsc compilation."),
    },
    async ({ phase, input, file }) => {
        // Lazily create session on first tool interaction (idempotent)
        if (phase === 'pre_code' || phase === 'continue' || phase === 'on_error') {
            await ensureSession(input);
        }

        // ── Q3 Direction 1: Resolve Agent's design phase (elicitation → fallback) ──
        let resolvedPhase = null;
        if (phase === 'pre_code') {
            try {
                resolvedPhase = await resolvePhase(input, server, 'preCode', {
                    getCachedPhase: getCurrentSessionPhase,
                    cachePhase: setCurrentSessionPhase,
                });
            } catch (_) { /* phase resolution is non-critical — falls back to inferPhase */ }
        }

        const result = await guide({ phase, input, file, resolvedPhase });

        // Push alerts: extract traps from pre_code and pattern phases
        // Q3: use resolved phase for push filtering
        if (phase === 'pre_code' || phase === 'pattern') {
            try {
                const keywords = extractKeywords(input);
                const m = matchKeywords(keywords);
                if (m.traps.length > 0) {
                    const trapItems = m.traps.slice(0, 5).map(t => ({ level: 'warn', title: t, detail: t, phase: t.phase }));
                    if (phase === 'pattern') {
                        alerts.onPattern(trapItems, input);
                    } else {
                        alerts.onPreCode(trapItems, input).catch(() => {});
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
    "specmate_scan",
    "【推荐入口】接收任务描述 + 可选 .bsv 文件路径。返回编译硬约束 + AST 预编译扫描（需传 file）+ 下一步建议。注意：不做主动设计指导，不接收 BSC 编译输出。",
    {
        task: z.string().describe("任务描述，如 '写一个SPI主控制器' 或 'mkFIFO vs mkBypassFIFO'"),
        file: z.string().optional().describe("可选 .bsv 文件路径。传入后 specmate 自动运行 AST 预编译扫描 (P0030/P0005/T0043/G0053/G0005)"),
    },
    async ({ task, file }) => {
        // Lazily create session (idempotent; Agent never sees session_id)
        await ensureSession(task);

        // ── Q3 Direction 1: Resolve Agent's design phase (elicitation → fallback) ──
        let resolvedPhase = null;
        try {
            resolvedPhase = await resolvePhase(task, server, 'preCode', {
                getCachedPhase: getCurrentSessionPhase,
                cachePhase: setCurrentSessionPhase,
            });
        } catch (_) { /* phase resolution is non-critical — falls back to inferPhase */ }

        const result = await scan(task, file || null, resolvedPhase);

        // Append cross-session historical statistics
        let historyBlock = '';
        try {
            const topErrors = await queryTopErrorCodes(5);
            const unresolvedCount = await queryUnresolvedCount();
            if (topErrors.length > 0 || unresolvedCount > 0) {
                const parts = ['\n---', '### 📊 历史统计（跨任务）', ''];
                if (topErrors.length > 0) {
                    parts.push('**近期高频错误码 TOP 5:**');
                    for (const e of topErrors) {
                        parts.push(`  \u2022 ${e.code}: ${e.total_count} 次（跨 ${e.session_count} 个 session）`);
                    }
                    parts.push('');
                }
                if (unresolvedCount > 0) {
                    parts.push(`**未解决 capture 数:** ${unresolvedCount} 个`);
                    parts.push(`> 调 \`mcp__bsv-specmate__specmate_resolve\` 逐条固化修复经验。`);
                    parts.push('');
                }
                historyBlock = parts.join('\n');
            }
        } catch (_) { /* non-critical */ }

        const responseText = result + historyBlock;

        // Push alerts for pre_code-like behavior (phase-aware)
        try {
            const keywords = extractKeywords(task);
            const m = matchKeywords(keywords);
            if (m.traps.length > 0) {
                const trapItems = m.traps.slice(0, 5).map(t => ({ level: 'warn', title: t, detail: t, phase: t.phase }));
                alerts.onPreCode(trapItems, task);
            }
        } catch (_) { /* push is non-critical */ }

        return { content: [{ type: "text", text: responseText }] };
    }
);

server.tool(
    "specmate_check",
    "接收 .bsv 文件路径+可选 compile 编译。返回静态检查+可选编译诊断结果。compile=true 时先跑 static check，再 spawn bsc 编译，编译输出自动喂给 diagnose 诊断。BSC 不可用时仅返回静态检查结果。",
    {
        files: z.array(z.string()).describe("要检查的 .bsv 文件路径列表"),
        full: z.boolean().optional().default(false).describe("设为 true 运行全部 19 项检查（含正则类深度规则）。默认运行 11 项高精度 always-on 规则。"),
        compile: z.boolean().optional().default(false).describe("Q3: 设为 true 时，静态检查之后 spawn bsc 编译，自动将编译输出喂给 diagnose 诊断。默认 false（仅静态检查）。"),
    },
    async ({ files, full, compile }) => {
        // P0: 路径校验 — 必须绝对路径，文件必须存在
        const pathCheck = validateFilePaths(files);
        if (!pathCheck.valid) {
            return { content: [{ type: "text", text: pathCheck.error }] };
        }

        // Lazily create session (idempotent)
        const session_id = await ensureSession();

        const level = getLevel();
        const cfg = LEVEL_LIMITS[level];
        const results = checkStyle({ files, full });

        // Push alerts for issues found
        if (results.length > 0) {
            try { alerts.onCheckStyle(results, files); } catch (_) {}
        }

        // Auto-count: every check_style hit increments the error's count
        [...new Set(results.map(r => r.check))].forEach(c => hitError(c).catch(err => console.error('[specmate] hitError failed:', err.message)));

        // Auto-capture check findings into captures table (source='check')
        for (const r of results) {
            await addCapture({
                code: r.check,
                bsc_output: r.message,
                files: r.file,
                file: r.file,
                source: 'check',
                session_id,
                cause: r.message,
            }).catch(err => console.error('[specmate] addCapture(check) failed:', err.message));
        }

        const staticResultLines = [];
        if (results.length === 0) {
            const msg = cfg.collabHint
                ? "没有发现问题。写得好。"
                : "没有发现问题。";
            staticResultLines.push(msg);
        } else {
            const text = results.map(r =>
                `[${r.check}] ${r.file}:${r.line} — ${r.message}\n  建议: ${r.suggestion}`
            ).join("\n\n");
            staticResultLines.push(`发现 ${results.length} 个问题:\n\n${text}`);
        }

        // ── Q3 Direction 2: compile=true — BSC compilation + diagnose pipeline (2.4, 2.5) ──
        let compileResult = '';
        if (compile) {
            try {
                const fs = await import('fs');
                const { runBSC } = await import('../src/compile/bsc-runner.mjs');

                // ── Compile cache check (子任务 2.6): skip if same files + same mtime ──
                const cacheKey = files.map(f => {
                    try {
                        const stat = fs.statSync(f);
                        return `${f}:${stat.mtimeMs}`;
                    } catch (_) { return f; }
                }).join('|');

                if (globalThis.__specmateCompileCache && globalThis.__specmateCompileCache.sessionId === session_id &&
                    globalThis.__specmateCompileCache.key === cacheKey) {
                    compileResult = `\n---\n### 🔄 编译已缓存 (BSC)\n\n(同一 session 内相同文件未变化，跳过编译)\n${globalThis.__specmateCompileCache.result}`;
                } else {
                    const topModule = files[0].replace(/^.*[\\/]/, '').replace(/\.bsv$/i, '');
                    const bscResult = await runBSC({
                        files,
                        topModule,
                        flags: ['-verilog'],
                    });

                    if (bscResult.success) {
                        compileResult = `\n---\n### 🔧 编译通过 (BSC ${bscResult.bscType})\n\nBSC 编译成功，无错误。\n`;
                    } else if (bscResult.bscType === 'unavailable') {
                        compileResult = `\n---\n### ⚠ 编译跳过\n\n${bscResult.combined}\n`;
                    } else {
                        // Feed compile output to diagnose (2.5: compile→diagnose pipeline)
                        let diagnoseText = '';
                        try {
                            diagnoseText = await diagnose(bscResult.combined, session_id, files);
                        } catch (_) { /* diagnose is non-critical */ }

                        compileResult = `\n---\n### 🔧 编译结果 (BSC ${bscResult.bscType})\n\n${bscResult.timedOut ? '⚠ 编译超时 (120s)\n\n' : ''}${bscResult.combined}${diagnoseText ? '\n\n' + diagnoseText : ''}`;
                    }

                    // Cache the result (子任务 2.6)
                    globalThis.__specmateCompileCache = {
                        sessionId: session_id,
                        key: cacheKey,
                        result: compileResult,
                    };
                }
            } catch (err) {
                // 子任务 2.7: graceful degradation
                compileResult = `\n---\n### ⚠ 编译执行失败\n\nspecmate 无法运行 BSC 编译: ${err.message}\n静态检查结果仍然可用。\n`;
            }
        }

        // Build final output: static check results + optional compile results
        const parts = [`### 📋 静态检查${compile ? ' + BSC编译' : ''}\n\n${staticResultLines.join('\n')}`];

        if (compileResult) {
            parts.push(compileResult);
        }

        // Cross-reference hints
        if (results.length > 0 && cfg.crossRef) {
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
                    parts.push(`\n💡 不确定怎么修? 调 specmate_guide(phase="decide", input="${c} 怎么修")`);
                    break;
                }
            }
        }

        if (cfg.collabHint) {
            parts.push("\n💬 修完后可以再检查一次。写下一部分时调 specmate_guide(phase=\"continue\")。");
        }

        return { content: [{ type: "text", text: parts.join("") }] };
    }
);

// specmate_learn tool removed — deprecated in Phase 1.
// add_error.mjs retained for db:seed script only — NOT an MCP tool.
// Use specmate_capture + specmate_resolve for the automated error capture/resolve flow.

server.tool(
    "specmate_capture",
    "接收 BSC 编译输出，提取标准错误码 [GPTBS]\\d{4} 记录到知识库。注意：仅做记录，不提供修复方案。查修复请用 specmate_diagnose 或 specmate_guide(on_error)。",
    {
        bsc_output: z.string().describe("bsc 编译器的完整输出 (stdout+stderr)"),
        files: z.array(z.string()).optional().describe("当前编译相关的 .bsv 文件路径"),
    },
    async ({ bsc_output, files }) => {
        // P0: 路径校验 — 必须绝对路径，文件必须存在
        if (files && files.length > 0) {
            const pathCheck = validateFilePaths(files);
            if (!pathCheck.valid) {
                return { content: [{ type: "text", text: pathCheck.error }] };
            }
        }

        // Lazily create session (idempotent)
        const session_id = await ensureSession();

        // Parse all error codes from bsc output
        const codePattern = /\b([GPTBS]\d{4})\b/g;
        const codes = [...new Set([...bsc_output.matchAll(codePattern)].map(m => m[1]))];

        if (codes.length === 0) {
            // Try to find error-like patterns even without standard codes
            const hasError = /error|warning/i.test(bsc_output);
            if (hasError) {
                if (files && files.length > 0) {
                    for (const f of files) {
                        addCapture({ code: "UNKNOWN", bsc_output, files: f, file: f, source: 'bsc', session_id }).catch(err => console.error('[specmate] addCapture(UNKNOWN) failed:', err.message));
                    }
                } else {
                    addCapture({ code: "UNKNOWN", bsc_output, source: 'bsc', session_id }).catch(err => console.error('[specmate] addCapture(UNKNOWN) failed:', err.message));
                }
                return { content: [{ type: "text", text: "未识别出标准错误码，已以 UNKNOWN 暂存。" }] };
            }
            return { content: [{ type: "text", text: "未在输出中检测到编译错误码。" }] };
        }

        // Per-file granularity: each (code, file) pair gets its own capture row
        const dedupSummary = [];
        for (const code of codes) {
            if (files && files.length > 0) {
                for (const f of files) {
                    const result = await addCapture({ code, bsc_output, files: f, file: f, source: 'bsc', session_id }).catch(err => {
                        console.error('[specmate] addCapture failed:', err.message);
                        return null;
                    });
                    if (result && result.deduped) {
                        dedupSummary.push(`${code}@${f} (重复 x${result.repeat_count || '+'})`);
                    }
                }
            } else {
                const result = await addCapture({ code, bsc_output, source: 'bsc', session_id }).catch(err => {
                    console.error('[specmate] addCapture failed:', err.message);
                    return null;
                });
                if (result && result.deduped) {
                    dedupSummary.push(`${code} (重复)`);
                }
            }
        }

        // Push alerts for captured errors
        if (codes.length > 0) {
            try { alerts.onCapture(codes); } catch (_) {}
        }

        const list = codes.map(c => `  \u2022 ${c}`).join('\n');
        const dedupNote = dedupSummary.length > 0
            ? `\n\n${dedupSummary.length} 条已在本次 session 中重复出现（count+1）。`
            : '';

        // Cross-session stats: "该错误码已累计 N 次（跨 M 个 session）"
        let crossSessionBlock = '';
        try {
            const crossStats = await Promise.all(codes.map(async (c) => {
                const s = await queryErrorCodeStats(c);
                return { code: c, ...s };
            }));
            crossStats.sort((a, b) => b.totalCount - a.totalCount);
            if (crossStats.length > 0 && crossStats[0].totalCount > 1) {
                const parts = crossStats.map(s =>
                    `  \u2022 ${s.code}: 累计 ${s.totalCount} 次（跨 ${s.sessionCount} 个 session）`
                );
                crossSessionBlock = `\n\n📊 跨任务统计:\n${parts.join('\n')}`;
            }
        } catch (_) { /* non-critical */ }
        const unresolvedMsg = codes.length === 1
            ? `错误码 ${codes[0]} 已记录。修好后调 specmate_resolve(code="${codes[0]}", cause="...", solution="...") 保存经验。${dedupNote}${crossSessionBlock}`
            : `共 ${codes.length} 个错误码已记录:\n${list}\n\n修好后逐条调 specmate_resolve 保存修复经验。${dedupNote}${crossSessionBlock}`;

        // P1: append session statistics
        let statsBlock = '';
        try {
            const stats = await querySessionStats(session_id);
            const stubborn = await queryStubbornErrors(session_id, 2);
            const parts = [`\n\n📊 当前任务统计:`];
            parts.push(`- 编译失败: ${stats.compileAttempts} 次`);
            parts.push(`- 未解决错误: ${stats.unresolvedCount} 个`);
            if (stubborn.length > 0) {
                for (const s of stubborn) {
                    const loc = s.file ? `${s.file} 中 ` : '';
                    parts.push(`- ⚠ 顽固错误: ${loc}${s.code} 已出现 ${s.repeat_count} 次`);
                }
            }
            statsBlock = parts.join('\n');
        } catch (_) { /* stats are non-critical */ }

        return { content: [{ type: "text", text: unresolvedMsg + statsBlock }] };
    }
);

server.tool(
    "specmate_resolve",
    "修复编译错误后调用，记录根因和方案并关联最近的 capture。注意：仅做经验固化，不提供修复建议。需先有 capture 记录。",
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

        // P1: append fix rate
        let fixRateBlock = '';
        try {
            const rate = await queryFixRate(getSessionId());
            if (rate.total > 0) {
                const pct = ((rate.resolved / rate.total) * 100).toFixed(1);
                fixRateBlock = `修复率: ${rate.resolved}/${rate.total} (${pct}%)`;
            }
        } catch (_) { /* stats are non-critical */ }

        return { content: [{ type: "text", text: `✅ ${code} 已标记为已解决。\n${fixRateBlock}` }] };
    }
);

server.tool(
    "specmate_analyze",
    "纯代码结构审查（AST）：分析调度冲突、依赖图、调用图、寄存器追踪。⚠️ 不处理编译输出——编译诊断请用 specmate_diagnose。不支持 BSC 内部错误（如 scanLinePosDirective），method-rule 调度冲突仅能识别不能修复，当前不检测 RAW 冲突。",
    {
        files: z.array(z.string()).describe("要分析的 .bsv 文件路径列表"),
        question: z.string().describe("想问什么？如 '调度冲突分析' / '模块依赖图' / 'rule 调用关系' / '寄存器读写分析' / '第156行是什么'"),
    },
    async ({ files, question }) => {
        // P0: 路径校验 — 必须绝对路径，文件必须存在
        if (files.length > 0) {
            const pathCheck = validateFilePaths(files);
            if (!pathCheck.valid) {
                return { content: [{ type: "text", text: pathCheck.error }] };
            }
        }

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
    "追踪编译迭代中 warning 变化。snapshot=存储快照，diff=对比最近两次（新增/消除/持续）。注意：需 2+ 次 snapshot 才能 diff，不做根因分析。",
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

server.tool(
    "specmate_diagnose",
    "【编译失败首选】接收 BSC 编译完整输出，批量解析所有错误码，逐一查知识库（现象/根因/修复方案），标记可自动修复 vs 需手动判断，自动记录到知识库。注意：仅解析标准格式 [GPTBS]\\d{4}，BSC 内部错误标记为 UNKNOWN 但无法提供方案。",
    {
        bsc_output: z.string().describe("BSC 编译器的完整输出 (stdout+stderr)"),
        files: z.array(z.string()).optional().describe("相关的 .bsv 文件路径（可选，用于精确记录捕获来源）"),
    },
    async ({ bsc_output, files }) => {
        // 路径校验
        if (files && files.length > 0) {
            const pathCheck = validateFilePaths(files);
            if (!pathCheck.valid) {
                return { content: [{ type: "text", text: pathCheck.error }] };
            }
        }

        // Lazily create session (idempotent)
        const session_id = await ensureSession();

        const result = await diagnose(bsc_output, session_id, files || null);

        // Push alerts for captured errors
        try {
            const codePattern = /\b([GPTBS]\d{4})\b/g;
            const codes = [...new Set([...bsc_output.matchAll(codePattern)].map(m => m[1]))];
            if (codes.length > 0) {
                alerts.onCapture(codes);
            }
        } catch (_) { /* push is non-critical */ }

        return { content: [{ type: "text", text: result }] };
    }
);

const TRANSPORT = (process.env.SPECMATE_TRANSPORT || 'stdio').toLowerCase();

// ── Auto-create session on server start ──
await ensureSession().then(sid => {
    console.error(`[specmate] Session started: ${sid}`);
}).catch(err => {
    console.error(`[specmate] Session creation failed: ${err.message}`);
});

// ── Graceful shutdown: end session ──
async function shutdown() {
    console.error('[specmate] Shutting down...');
    try {
        await endCurrentSession();
        console.error('[specmate] Session ended.');
    } catch (err) {
        console.error(`[specmate] Session end failed: ${err.message}`);
    }
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (TRANSPORT === 'stdio') {
  // stdio fallback — keep existing behavior
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[specmate] MCP stdio transport ready');

  // Graceful close on stdio stream end
  process.stdin.on('end', () => {
      console.error('[specmate] stdio stream ended, closing...');
      shutdown();
  });
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

  // Graceful close on HTTP server shutdown
  httpServer.on('close', () => {
      console.error('[specmate] HTTP server closed.');
  });
}

// Initialize MCP notification bridge — replaces WebSocket push
initNotify(server.server);
