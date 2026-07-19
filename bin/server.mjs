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
import { hitError, addCapture, getLatestCaptureByCode, queryCapturesByCode, resolveCaptureById, saveWarningSnapshot, diffWarnings, queryLatestSnapshots, ensureSession, getSessionId, endCurrentSession, querySessionStats, queryStubbornErrors, queryFixRate, queryErrorCodeStats, queryTopErrorCodes, queryUnresolvedCount, queryUnresolvedCaptures, queryFileTopErrors, queryClusteredCaptures, getCurrentSessionPhase, setCurrentSessionPhase, queryReportSummary, queryErrorTrend, queryFileHotspots, queryFixRateTrend, queryKnowledgeGrowth, queryWeeklyTopErrors, queryError, queryAllErrors, queryAllCapturesByCode, queryListSessions, queryListCaptures, queryCountCaptures, queryUpdateError, queryDeleteError, queryDeleteCapture, queryExportKnowledge, queryImportKnowledge } from "../src/db/query.mjs";
import { resolvePhase } from "../src/elicitation/elicit-phase.mjs";
import { parseBSCWarnings } from "../src/tools/warning_diff.mjs";
import { diagnose, diagnoseStream } from "../src/tools/specmate_diagnose.mjs";
import { parseFile, extractAll, analyzeScheduling, buildCallGraph, buildDependencyGraph, findConflictPairs, extractMethods, extractRegWrites, extractRegDeclarations, queryNodeAt, analyzeRuleConflicts, analyzeMethodOrder, findImplicitConflicts } from "../src/tools/ast_query.mjs";
import { existsSync, readFileSync } from "fs";
import { isAbsolute, resolve as resolvePath, dirname } from "path";
import { fileURLToPath } from "url";
import { extractKeywords, match as matchKeywords } from "../src/tools/_matcher.mjs";
import { autoFixP0200 } from "../src/tools/auto_fix.mjs";
import { init as initNotify } from "../src/notify.mjs";
import * as alerts from "../src/push/alerts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = readFileSync(resolvePath(__dirname, '../src/dashboard.html'), 'utf-8');

// ── Dashboard API helpers ──

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
        });
    });
}

function apiResponse(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function apiError(res, message, status = 400) {
    apiResponse(res, { error: message }, status);
}

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

        // ── 3.1: Cluster hint — suggest auto-cluster when unknown errors repeat ──
        let clusterBlock = '';
        try {
            const clusters = await queryClusteredCaptures(3, 2);
            if (clusters.length > 0) {
                clusterBlock = `\n---\n### 💡 知识增长机会\n\n检测到 ${clusters.length} 个未知错误已重复出现 3+ 次（跨 2+ session），运行 \`node scripts/auto-cluster.mjs\` 自动生成知识条目。\n`;
            }
        } catch (_) { /* non-critical */ }

        const responseText = result + historyBlock + clusterBlock;

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
        let uncoveredBSC = null;
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
                        // ── 1.2: bsc_verified — annotate static check results with BSC verification ──
                        const bscOutput = bscResult.stdout + bscResult.stderr;
                        const bscCodeRegex = /\b([GPTBS]\d{4})\b/g;
                        const bscCodes = [...new Set([...bscOutput.matchAll(bscCodeRegex)].map(m => m[1]))];

                        // Annotate each static check issue with bsc_verified
                        if (results.length > 0) {
                            for (const issue of results) {
                                if (issue.error || !issue.check) continue;
                                const checkCode = issue.check;
                                let matched = bscCodes.includes(checkCode);
                                if (!matched) {
                                    // Prefix match: G0004_FSM ↔ G0004, P0030_root ↔ P0030
                                    for (const bc of bscCodes) {
                                        if (checkCode.startsWith(bc + '_') || bc.startsWith(checkCode + '_')) {
                                            matched = true;
                                            break;
                                        }
                                    }
                                }
                                issue.bsc_verified = matched;
                            }

                            // Rebuild static result lines with bsc_verified annotations
                            staticResultLines.length = 0;
                            const text = results.map(r => {
                                const v = r.bsc_verified === true ? ' [BSC ✓]' : r.bsc_verified === false ? ' [BSC ?]' : '';
                                return `[${r.check}]${v} ${r.file}:${r.line} — ${r.message}\n  建议: ${r.suggestion}`;
                            }).join("\n\n");
                            staticResultLines.push(`发现 ${results.length} 个问题:\n\n${text}`);
                        }

                        // Detect BSC codes not covered by any static check
                        if (bscCodes.length > 0) {
                            const staticCheckCodes = new Set(results.map(r => r.check).filter(Boolean));
                            const uncoveredCodes = bscCodes.filter(bc =>
                                ![...staticCheckCodes].some(sc =>
                                    sc === bc || sc.startsWith(bc + '_') || bc.startsWith(sc + '_')
                                )
                            );
                            if (uncoveredCodes.length > 0) {
                                uncoveredBSC = uncoveredCodes;
                            }
                        }

                        compileResult = `\n---\n### 🔧 编译通过 (BSC ${bscResult.bscType})\n\nBSC 编译成功，无错误。\n`;

                        if (uncoveredBSC && uncoveredBSC.length > 0) {
                            compileResult += `\n⚠️ BSC 检测到但 specmate 静检未覆盖: ${uncoveredBSC.join(', ')}\n`;
                        }

                        // ── 1.1: auto-resolve unresolved captures for files that now compile ──
                        let autoResolved = 0;
                        try {
                            const unresolved = await queryUnresolvedCaptures();
                            const sessionUnresolved = unresolved.filter(
                                c => c.session_id === session_id && c.status === 'unresolved'
                            );
                            const currentFiles = new Set(files.map(f => resolvePath(f)));
                            for (const c of sessionUnresolved) {
                                // Normalize capture file paths and check for overlap
                                const captureFilesRaw = c.files || c.file || '';
                                const captureFiles = captureFilesRaw.split(',').map(f => {
                                    try { return resolvePath(f.trim()); } catch (_) { return f.trim(); }
                                });
                                const overlap = captureFiles.some(f => currentFiles.has(f));
                                if (overlap) {
                                    await resolveCaptureById(c.id, {
                                        cause: 'auto-resolved: BSC compilation passed',
                                        solution: 'auto-detected by compile success'
                                    });
                                    autoResolved++;
                                }
                            }
                        } catch (_) { /* auto-resolve is non-critical */ }

                        if (autoResolved > 0) {
                            compileResult += `\n✅ 自动归档了 ${autoResolved} 个未解决的 capture\n`;
                        }
                    } else if (bscResult.bscType === 'unavailable') {
                        compileResult = `\n---\n### ⚠ 编译跳过\n\n${bscResult.combined}\n`;
                    } else {
                        // Feed compile output to diagnose (2.5: compile→diagnose pipeline)
                        let diagnoseText = '';
                        try {
                            diagnoseText = await diagnose(bscResult.combined, session_id, files);
                        } catch (_) { /* diagnose is non-critical */ }

                        compileResult = `\n---\n### 🔧 编译结果 (BSC ${bscResult.bscType})\n\n${bscResult.timedOut ? '⚠ 编译超时 (120s)\n\n' : ''}${bscResult.combined}${diagnoseText ? '\n\n' + diagnoseText : ''}`;

                        // ── 2.1: P0200 auto-fix — expand BVI schedule groups ──
                        const hasP0200 = /\bP0200\b/.test(bscResult.combined);
                        if (hasP0200) {
                            let autoFixApplied = false;
                            let autoFixSuccess = false;
                            try {
                                const fs = await import('fs');
                                for (const f of files) {
                                    if (!fs.existsSync(f)) continue;
                                    const originalSource = fs.readFileSync(f, 'utf-8');
                                    const fixResult = autoFixP0200(originalSource);
                                    if (fixResult.fixed) {
                                        autoFixApplied = true;
                                        fs.writeFileSync(f, fixResult.newSource, 'utf-8');
                                        let fixLog = `\n---\n### 🔧 自动修复: P0200\n\n`;
                                        fixLog += fixResult.changes.map(c => `- ${c}`).join('\n') + '\n';
                                        compileResult += fixLog;

                                        // Recompile after auto-fix
                                        try {
                                            const recompile = await runBSC({
                                                files,
                                                topModule,
                                                flags: ['-verilog'],
                                            });
                                            if (recompile.success) {
                                                autoFixSuccess = true;
                                                compileResult += `\n✅ P0200 自动修复成功: schedule 分组已展开为逐对声明\n`;
                                                compileResult += `\n### 🔧 重新编译通过 (BSC ${recompile.bscType})\n`;
                                            } else {
                                                compileResult += `\n⚠️ 自动修复尝试未完全解决问题，请手动检查\n`;
                                                if (recompile.combined) {
                                                    compileResult += `\n${recompile.combined}`;
                                                }
                                            }
                                        } catch (_) {
                                            compileResult += `\n⚠️ 自动修复后重新编译失败，请手动检查\n`;
                                        }
                                        break; // Only fix the first file with P0200
                                    }
                                }
                            } catch (_) { /* auto-fix is non-critical */ }
                        }
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

        // ── 3.2: Cross-session hot tracking — show top errors for current files ──
        let hotTrackingBlock = '';
        try {
            const fileTopErrors = await queryFileTopErrors(files, 3);
            if (fileTopErrors.length > 0) {
                const entries = fileTopErrors.map(e =>
                    `${e.code}(${e.total_count}次 跨${e.session_count}个session)`
                ).join('\n  \u2022 ');
                hotTrackingBlock = `\u26a0\ufe0f 历史热点：这些文件最常触发的错误码 \u2014\n  \u2022 ${entries}\n\n`;
            }
        } catch (_) { /* non-critical */ }

        // Build final output: static check results + optional compile results
        const parts = [`### 📋 静态检查${compile ? ' + BSC编译' : ''}\n\n${hotTrackingBlock}${staticResultLines.join('\n')}`];

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

        // Q4: Streaming mode — 逐错误码 yield，减少 Agent 等待时间
        // 当前 stdio 传输下累积后返回，架构已为 HTTP/SSE streaming 准备就绪
        const chunks = [];
        for await (const chunk of diagnoseStream(bsc_output, session_id, files || null)) {
            chunks.push(chunk);
        }

        // Push alerts for captured errors
        try {
            const codePattern = /\b([GPTBS]\d{4})\b/g;
            const codes = [...new Set([...bsc_output.matchAll(codePattern)].map(m => m[1]))];
            if (codes.length > 0) {
                alerts.onCapture(codes);
            }
        } catch (_) { /* push is non-critical */ }

        return { content: [{ type: "text", text: chunks.join('\n') }] };
    }
);

server.tool(
    "specmate_report",
    "跨 session 高级分析报告：错误趋势、文件热点、知识库健康度。集成 specmate_scan/specmate_diagnose 的统计数据，提供宏观视角。",
    {
        section: z.enum(["all", "trend", "hotspots", "health"]).optional().default("all")
            .describe("报告段落: all=完整, trend=错误趋势, hotspots=文件热点, health=知识库健康度"),
        trend_granularity: z.enum(["week", "month"]).optional().default("week")
            .describe("趋势粒度（仅 section=all|trend 时生效）"),
        top_n: z.number().int().min(1).max(20).optional().default(5)
            .describe("TOP N 数量"),
    },
    async ({ section, trend_granularity, top_n }) => {
        const summary = await queryReportSummary();

        // 如果没有数据，直接返回提示
        if (summary.totalCaptures === 0) {
            return {
                content: [{
                    type: "text",
                    text: "# specmate 跨任务分析报告\n\n> 暂无采集数据。开始使用 specmate_scan 和 specmate_diagnose 后，报告会自动生成。\n"
                }],
            };
        }

        const parts = [];
        parts.push(`# specmate 跨任务分析报告\n`);
        parts.push(`> 覆盖: ${summary.totalSessions} 个 session | ${summary.totalCaptures} 条 capture | ${summary.knowledgeEntries} 个知识条目\n`);

        const includeTrend = section === "all" || section === "trend";
        const includeHotspots = section === "all" || section === "hotspots";
        const includeHealth = section === "all" || section === "health";

        // ── 1. 错误趋势 ──
        if (includeTrend) {
            const trend = await queryErrorTrend({ granularity: trend_granularity, topN: top_n });

            parts.push(`---\n`);
            parts.push(`## 1. 错误趋势\n`);

            if (trend.additionalInfo && trend.series.length === 0) {
                parts.push(`> ${trend.additionalInfo}\n`);
            } else if (trend.series.length > 0 && trend.periods.length > 0) {
                const periodLabel = trend_granularity === "month" ? "月" : "周";

                parts.push(`### TOP ${top_n} 高频错误码${periodLabel}趋势\n`);

                // 表头
                const header = `| 错误码 | ${trend.periods.join(" | ")} | 趋势 |`;
                parts.push(header);
                parts.push(`|--------|${trend.periods.map(() => "-----").join("|")}|------|`);

                // 数据行
                for (const s of trend.series) {
                    const counts = s.values.map(v => String(v.count));
                    // 计算趋势：比较第一个和最后一个非零周期
                    const nonZero = s.values.filter(v => v.count > 0);
                    let trendSymbol = "→";
                    if (nonZero.length >= 2) {
                        const first = nonZero[0].count;
                        const last = nonZero[nonZero.length - 1].count;
                        const change = (last - first) / first;
                        if (change > 0.2) trendSymbol = "↗";
                        else if (change < -0.2) trendSymbol = "↘";
                        else trendSymbol = "→";
                    }
                    parts.push(`| ${s.code} | ${counts.join(" | ")} | ${trendSymbol} |`);
                }

                parts.push(`\n> ↗ 上升 >20% | → 平稳 | ↘ 下降 >20%\n`);
            }

            // 每周 TOP N
            if (trend.periods.length >= 2) {
                const weeklyTop = await queryWeeklyTopErrors(top_n, 4);
                if (weeklyTop.length > 0) {
                    parts.push(`### 每周 TOP ${top_n} 错误码\n`);
                    for (const w of weeklyTop) {
                        const topList = w.top.map(t => `${t.code}(${t.count})`).join(", ");
                        parts.push(`- **${w.period}**: ${topList || "无"}\n`);
                    }
                    parts.push("");
                }
            }
        }

        // ── 2. 文件热点 ──
        if (includeHotspots) {
            const hotspots = await queryFileHotspots(top_n);

            parts.push(`---\n`);
            parts.push(`## 2. 文件热点\n`);

            if (hotspots.length === 0) {
                parts.push(`> 暂无文件热点数据。\n`);
            } else {
                parts.push(`| 文件 | 错误次数 | 跨 session | 常见错误码 |`);
                parts.push(`|------|---------|-----------|-----------|`);
                for (const h of hotspots) {
                    const fileName = h.file ? h.file.replace(/^.*[/\\]/, '') : '(unknown)';
                    const codes = (h.error_codes || "").split(",").slice(0, 3).join(", ");
                    parts.push(`| ${fileName} | ${h.total_count} | ${h.session_count} | ${codes} |`);
                }
                parts.push("");
            }
        }

        // ── 3. 知识库健康度 ──
        if (includeHealth) {
            parts.push(`---\n`);
            parts.push(`## 3. 知识库健康度\n`);

            const fixRateTrend = await queryFixRateTrend();
            const knowledgeGrowth = await queryKnowledgeGrowth();

            // 修复率趋势
            parts.push(`### 修复率趋势\n`);
            if (fixRateTrend.length === 0) {
                parts.push(`> 暂无修复率数据。\n`);
            } else {
                parts.push(`| 周 | 总捕获 | 已修复 | 修复率 |`);
                parts.push(`|-----|-------|--------|--------|`);
                for (const r of fixRateTrend) {
                    parts.push(`| ${r.period} | ${r.total} | ${r.resolved} | ${r.rate_pct}% |`);
                }
                parts.push("");
            }

            // 知识增长速度
            parts.push(`### 知识增长速度\n`);
            if (knowledgeGrowth.length === 0) {
                parts.push(`> 暂无增长速度数据。\n`);
            } else {
                parts.push(`| 周 | 新错误码 | 总捕获 |`);
                parts.push(`|-----|---------|--------|`);
                for (const k of knowledgeGrowth) {
                    parts.push(`| ${k.period} | ${k.new_codes} | ${k.total_captures} |`);
                }
                parts.push("");
            }

            // 未解决概况
            const unresolvedCount = summary.totalCaptures - summary.resolvedCaptures;
            parts.push(`### 未解决概况\n`);
            parts.push(`- 未解决 capture: ${unresolvedCount} 个\n`);
            parts.push(`- 已知错误码: ${summary.distinctErrorCodes} 个（已解决 ${summary.resolvedCaptures} 条）\n`);
            parts.push("");
        }

        parts.push(`---\n`);
        parts.push(`*报告由 specmate 自动生成*\n`);

        const reportMarkdown = parts.join("\n");
        return { content: [{ type: "text", text: reportMarkdown }] };
    }
);

const TRANSPORT = (process.env.SPECMATE_TRANSPORT || 'stdio').toLowerCase();
const MGMT_PORT = parseInt(process.env.SPECMATE_PORT || '9339', 10);

// ── Management route handler (Dashboard + API) — shared by both transports ──
async function handleManagementRoutes(req, res) {
    // Dashboard page
    if (req.method === 'GET' && req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(DASHBOARD_HTML);
        return true;
    }

    // API routes
    if (req.url.startsWith('/api/')) {
        const url = new URL(req.url, `http://127.0.0.1:${MGMT_PORT}`);
        const path = url.pathname;

        // GET /api/summary
        if (req.method === 'GET' && path === '/api/summary') {
            try {
                const summary = await queryReportSummary();
                apiResponse(res, summary);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/errors
        if (req.method === 'GET' && path === '/api/errors') {
            try {
                const errors = await queryAllErrors();
                apiResponse(res, errors);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/errors/:code
        const errorDetailMatch = path.match(/^\/api\/errors\/([^/]+)$/);
        if (req.method === 'GET' && errorDetailMatch) {
            try {
                const code = errorDetailMatch[1];
                const err = await queryError(code);
                if (!err) { apiError(res, 'Error not found', 404); return true; }
                const captures = await queryAllCapturesByCode(code);
                apiResponse(res, { error: err, captures });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // PUT /api/errors/:code
        if (req.method === 'PUT' && errorDetailMatch) {
            try {
                const code = errorDetailMatch[1];
                const body = await parseBody(req);
                await queryUpdateError(code, body);
                apiResponse(res, { ok: true });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // DELETE /api/errors/:code
        if (req.method === 'DELETE' && errorDetailMatch) {
            try {
                const code = errorDetailMatch[1];
                await queryDeleteError(code);
                apiResponse(res, { ok: true });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/captures
        if (req.method === 'GET' && path === '/api/captures') {
            try {
                const page = parseInt(url.searchParams.get('page') || '1', 10);
                const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
                const status = url.searchParams.get('status') || null;
                const code = url.searchParams.get('code') || null;
                const items = await queryListCaptures({ page, pageSize, status, code });
                const total = await queryCountCaptures({ status, code });
                apiResponse(res, { items, total, page, pageSize });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // DELETE /api/captures/:id
        const captureDeleteMatch = path.match(/^\/api\/captures\/(\d+)$/);
        if (req.method === 'DELETE' && captureDeleteMatch) {
            try {
                const id = parseInt(captureDeleteMatch[1], 10);
                await queryDeleteCapture(id);
                apiResponse(res, { ok: true });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/sessions
        if (req.method === 'GET' && path === '/api/sessions') {
            try {
                const sessions = await queryListSessions();
                apiResponse(res, sessions);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/export
        if (req.method === 'GET' && path === '/api/export') {
            try {
                const data = await queryExportKnowledge();
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Disposition': 'attachment; filename="specmate-knowledge.json"',
                });
                res.end(JSON.stringify(data));
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // POST /api/import
        if (req.method === 'POST' && path === '/api/import') {
            try {
                const body = await parseBody(req);
                const result = await queryImportKnowledge(body);
                apiResponse(res, result);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        apiError(res, 'Not Found', 404);
        return true;
    }

    return false; // not a management route
}

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
  // stdio — MCP stays on stdio; Dashboard runs on separate HTTP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[specmate] MCP stdio transport ready');

  // Management HTTP server — Dashboard + API only, no MCP over HTTP
  const mgmtServer = createServer();
  mgmtServer.on('request', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', transport: 'stdio+dashboard' }));
          return;
      }
      const handled = await handleManagementRoutes(req, res);
      if (!handled) { res.writeHead(404); res.end('Not Found'); }
  });
  mgmtServer.listen(MGMT_PORT, '127.0.0.1', () => {
      console.error(`[specmate] Dashboard on http://127.0.0.1:${MGMT_PORT}/dashboard`);
  });

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

    // Management routes (Dashboard + API) — delegated to shared handler
    if (await handleManagementRoutes(req, res)) return;

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
