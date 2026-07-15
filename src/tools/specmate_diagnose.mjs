/**
 * specmate_diagnose — BSC 编译日志全量诊断
 *
 * 接受 BSC 编译器的完整输出（stdout+stderr），解析所有错误码，
 * 对每个错误码查知识库（现象/原因/解决方案/规则），标记"可自动修复"vs"需手动"，
 * 同时自动捕获到 captures 表（复用 specmate_capture 的捕获逻辑）。
 *
 * 输入:
 *   bsc_output: string — BSC 编译器的完整输出
 *   session_id:  string — 当前 session ID（由 server 层传入）
 *
 * 输出:
 *   格式化的 Markdown 诊断报告
 */

import { queryError, addCapture, addCapturesBatch, queryErrorCodeStats } from '../db/query.mjs';

/**
 * 解析单个 BSC 诊断条目。
 * 每个条目是一个 error/warning，包含代码、文件路径、行号、列号、消息文本。
 * @typedef {{ code: string, file: string, line: number, col: number|null, message: string, severity: string }} DiagnoseEntry
 */

/**
 * 从 BSC 输出中提取所有诊断条目的位置映射。
 * 使用两种策略：
 *   1. 标准正则：匹配 "Warning/Error: \"File\", line N, column M: (CODE)"
 *      后面紧跟的 "message" 行
 *   2. 补充正则：从整个输出中提取所有错误码并关联最近的文件/行号上下文
 *
 * @param {string} bscOutput
 * @returns {DiagnoseEntry[]}
 */
export function parseBSCDiagnostics(bscOutput) {
    const entries = [];

    // Normalize line endings (handle Windows \r\n)
    const normalized = bscOutput.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // ── 策略 1：标准 BSC 格式 ──
    // Format:
    //   Warning: "File.bsv", line 42, column 10: (G0010)
    //     "message text"
    //   Error: "File.bsv", line 123: (P0200)
    //     "message text"
    //
    // 注意：column 可选，某些 BSC 版本省略
    const standardRe = /(Warning|Error):\s*"([^"]+)",\s*line\s*(\d+)(?:,\s*column\s*(\d+))?[^)]*\((\w+)\)\s*\n\s*(?:"([^"]*)"|([^\n]*))/g;

    let m;
    while ((m = standardRe.exec(normalized)) !== null) {
        const message = (m[6] !== undefined ? m[6] : (m[7] || '')).trim();
        entries.push({
            code: m[5],
            file: m[2],
            line: parseInt(m[3], 10),
            col: m[4] ? parseInt(m[4], 10) : null,
            message: message || '(no message)',
            severity: m[1].toLowerCase() === 'error' ? 'error' : 'warning',
        });
    }

    // ── 策略 2：回退 — 非标准格式的错误码 ──
    // 有些 BSC 输出可能有多行消息或非标准格式。
    // 先收集已匹配的位置，然后扫描剩余的代码实例。
    const alreadyMatched = new Set(entries.map(e => `${e.code}:${e.file}:${e.line}`));

    // 查找所有 (CODE) 出现的位置
    const codeRe = /\((\w+)\)/g;
    const lines = normalized.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let cm;
        while ((cm = codeRe.exec(line)) !== null) {
            const code = cm[1];
            // 只处理看起来像 BSC 错误码的（GPTBS + 4 位数字）
            if (!/^[GPTBS]\d{4}$/.test(code)) continue;

            // 尝试在此行或其上方找到文件路径和行号
            const fileMatch = line.match(/"([^"]+\.bsv)"/);
            const lineMatch = line.match(/line\s*(\d+)/);

            if (fileMatch && lineMatch) {
                const f = fileMatch[1];
                const l = parseInt(lineMatch[1], 10);
                const key = `${code}:${f}:${l}`;
                if (alreadyMatched.has(key)) continue;
                alreadyMatched.add(key);

                // 提取消息：从多行收集直到下一个错误码或空行
                let msg = line.replace(/.*\((\w+)\).*/, '').trim();
                if (!msg) {
                    // 检查下一行
                    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                        const next = lines[j].trim();
                        if (next && !/^\s*\(/.test(next) && !/Warning:|Error:/.test(next)) {
                            msg = next.replace(/^"|"$/g, '');
                            break;
                        }
                    }
                }
                if (!msg) msg = '(no message)';

                entries.push({
                    code,
                    file: f,
                    line: l,
                    col: null,
                    message: msg,
                    severity: line.toLowerCase().includes('error') ? 'error' :
                              line.toLowerCase().includes('warning') ? 'warning' : 'error',
                });
            }
        }
    }

    return entries;
}

/**
 * 判断某错误码是否可自动修复。
 * 基于知识库的 rules 字段中的启发式：
 *   - 如果 rules 包含可编程的语法模式（如 BVI schedule 展开），标记为可自动修复
 *   - 如果 rules 涉及设计决策（method-rule 冲突等），标记为需手动
 *   - 如果无规则，默认标记为需手动
 *
 * @param {string|null} rules - 知识库中的 rules 字段
 * @param {string} code - 错误码
 * @returns {'auto'|'manual'}
 */
function detectAutoFixability(rules, code) {
    if (!rules) return 'manual';

    const r = rules.toLowerCase();

    // P2-3: 双因子判断 — 不仅看错误码前缀，还解析 rules 文本关键词
    // Auto 信号词：明确的机械操作，可程序化执行
    const autoSignals = [
        '添加', '加上', '替换为', '改为', '展开', '逐对',
        'bvi schedule', 'cf ', '部分应用', '\\\\==', 'let 绑定',
        'pragma', 'suffix', '去掉', '删除',
    ];

    // Manual 信号词：需要设计判断，不能机械执行
    const manualSignals = [
        '需检查', '取决于', '需确认', '设计层', '接受或',
        '调度冲突', 'method-rule', '数据依赖', '规则内',
        'urgency', '评估', '权衡',
    ];

    let autoScore = 0;
    let manualScore = 0;

    for (const signal of autoSignals) {
        if (r.includes(signal)) autoScore++;
    }
    for (const signal of manualSignals) {
        if (r.includes(signal)) manualScore++;
    }

    // 有明确操作指令且无设计判断 → auto
    if (autoScore > 0 && manualScore === 0) return 'auto';
    // 有设计判断 → manual（无论 auto 得分多少）
    if (manualScore > 0) return 'manual';

    // Fallback：按错误码系列推断
    if (code.startsWith('G') || code.startsWith('T') || code.startsWith('S')) {
        return 'manual';
    }
    if (code.startsWith('P') || code.startsWith('B')) {
        return 'auto';
    }

    return 'manual';
}

/**
 * specmate_diagnose 主函数。
 *
 * @param {string} bscOutput - BSC 编译器完整输出
 * @param {string} sessionId - 当前 session ID
 * @param {string[]|null} files - 可选的相关 .bsv 文件路径
 * @returns {Promise<string>} Markdown 格式的诊断报告
 */
export async function diagnose(bscOutput, sessionId, files = null) {
    const entries = parseBSCDiagnostics(bscOutput);

    // ── 按错误码分组 ──
    /** @type {Map<string, DiagnoseEntry[]>} */
    const groups = new Map();
    for (const e of entries) {
        if (!groups.has(e.code)) groups.set(e.code, []);
        groups.get(e.code).push(e);
    }

    // 统计
    const totalErrors = entries.filter(e => e.severity === 'error').length;
    const totalWarnings = entries.filter(e => e.severity === 'warning').length;
    const uniqueCodes = groups.size;

    // ── 构建报告 ──
    const lines = [];

    lines.push('## 编译诊断报告');
    lines.push('');

    // 概览
    if (totalErrors > 0 || totalWarnings > 0) {
        const overviewParts = [];
        if (totalErrors > 0) overviewParts.push(`错误: ${totalErrors} 个`);
        if (totalWarnings > 0) overviewParts.push(`警告: ${totalWarnings} 个`);
        overviewParts.push(`涉及 ${uniqueCodes} 种错误码`);
        lines.push(`### 概览`);
        lines.push(`- ${overviewParts.join('，')}`);
        lines.push('');
    } else if (entries.length === 0) {
        // 尝试宽松检测：bsc_output 非空但没解析到标准格式
        const hasErrorLike = /error|warning/i.test(bscOutput);
        if (hasErrorLike) {
            lines.push('### 概览');
            lines.push('- 检测到编译输出，但未解析到标准 BSC 错误格式。');
            lines.push('- 原始输出已自动记录（code=UNKNOWN）供后续分析。');
            lines.push('');

            // Auto-capture as UNKNOWN
            try {
                await addCapture({
                    code: 'UNKNOWN',
                    bsc_output: bscOutput,
                    files: files ? files.join(',') : null,
                    source: 'bsc',
                    session_id: sessionId,
                });
            } catch (_) { /* non-critical */ }

            if (bscOutput.length > 0) {
                lines.push('### 原始输出（前 20 行）');
                lines.push('```');
                const preview = bscOutput.split('\n').slice(0, 20).join('\n');
                lines.push(preview);
                if (bscOutput.split('\n').length > 20) lines.push('... (截断)');
                lines.push('```');
                lines.push('');
                lines.push('> 调 `mcp__bsv-specmate__specmate_capture` 重新捕获，或手动调 `specmate_resolve` 固化经验。');
            }

            return lines.join('\n');
        } else {
            lines.push('### 概览');
            lines.push('- 未在输出中检测到编译错误或警告。');
            lines.push('- 编译可能已成功，0 Error 0 Warning。');
            return lines.join('\n');
        }
    }

    // 没有解析到条目但有一定数量的 Error/Warning 关键词
    if (entries.length === 0) {
        return lines.join('\n');
    }

    // ── 按错误码分类展示 ──
    const knownCodes = [];
    const unknownCodes = [];

    lines.push('---');
    lines.push('');
    lines.push('### 按错误码分类');
    lines.push('');

    // 先查询所有已知码的知识库条目（并行）
    const allCodes = [...groups.keys()];
    const kbResults = new Map();
    const statsResults = new Map();

    for (const code of allCodes) {
        try {
            const err = await queryError(code);
            kbResults.set(code, err);
        } catch (_) {
            kbResults.set(code, null);
        }
        try {
            const stats = await queryErrorCodeStats(code);
            statsResults.set(code, stats);
        } catch (_) {
            statsResults.set(code, { totalCount: 0, sessionCount: 0 });
        }
    }

    // 分类：已知 vs 未知
    for (const code of allCodes) {
        if (kbResults.get(code)) {
            knownCodes.push(code);
        } else {
            unknownCodes.push(code);
        }
    }

    // ── 已知错误码 ──
    for (const code of knownCodes) {
        const err = kbResults.get(code);
        const stats = statsResults.get(code);
        const groupEntries = groups.get(code);

        // 收集位置
        const locations = groupEntries.map(e => `${e.file}:${e.line}`);

        // unique locations, preserved order
        const uniqueLocs = [];
        const seen = new Set();
        for (const loc of locations) {
            if (!seen.has(loc)) {
                seen.add(loc);
                uniqueLocs.push(loc);
            }
        }
        const locStr = uniqueLocs.length <= 5
            ? uniqueLocs.join(', ')
            : `${uniqueLocs.slice(0, 5).join(', ')} ... 等 ${uniqueLocs.length} 处`;

        const severity = groupEntries[0].severity === 'error' ? 'Error' : 'Warning';
        const count = groupEntries.length;
        const xLabel = count > 1 ? ` ×${count}` : '';

        lines.push(`#### ${code} (${severity})${xLabel}`);
        lines.push(`- **位置**: ${locStr}`);
        lines.push(`- **现象**: ${err.phenomena || '(未记录)'}`);
        lines.push(`- **根因**: ${err.cause || '(未记录)'}`);
        lines.push(`- **修复**: ${err.solution || '(未记录)'}`);
        if (err.rules) {
            lines.push(`- **规则**: ${err.rules}`);
        }

        // 跨 session 统计
        if (stats.totalCount > 0) {
            lines.push(`- **历史**: 累计 ${stats.totalCount} 次（跨 ${stats.sessionCount} 个 session）`);
        }

        // 自动修复能力
        const autoFix = detectAutoFixability(err.rules, code);
        if (autoFix === 'auto') {
            lines.push(`- **可自动修复**: 是`);
        } else {
            lines.push(`- **可自动修复**: 否（需要人工判断设计意图）`);
        }

        lines.push('');
    }

    // ── 未知错误码 ──
    if (unknownCodes.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('### 知识库未覆盖');
        lines.push('');

        for (const code of unknownCodes) {
            const groupEntries = groups.get(code);
            const locations = groupEntries.map(e => `${e.file}:${e.line}`);

            // unique locations
            const uniqueLocs = [];
            const seen = new Set();
            for (const loc of locations) {
                if (!seen.has(loc)) {
                    seen.add(loc);
                    uniqueLocs.push(loc);
                }
            }
            const locStr = uniqueLocs.join(', ');

            // 示例消息
            const sampleMsg = groupEntries[0].message || '(unknown)';
            const count = groupEntries.length;
            const xLabel = count > 1 ? ` ×${count}` : '';

            lines.push(`#### ${code}${xLabel}`);
            lines.push(`- **位置**: ${locStr}`);
            lines.push(`- **消息示例**: "${sampleMsg}"`);

            // 跨 session 统计
            const stats = statsResults.get(code);
            if (stats && stats.totalCount > 0) {
                lines.push(`- **历史**: 累计 ${stats.totalCount} 次（跨 ${stats.sessionCount} 个 session）`);
            }

            lines.push(`- **建议**: 调 \`mcp__bsv-specmate__specmate_capture\` 记录后联系维护者`);
            lines.push(`- **后续**: 修复后调 \`mcp__bsv-specmate__specmate_resolve(code="${code}", cause="...", solution="...")\` 固化经验`);
            lines.push('');
        }
    }

    // ── Auto-capture (batch) ──
    // P2-1: 收集所有条目，一次性批量写入，替代 O(codes×files) 循环
    const batchEntries = [];
    for (const code of allCodes) {
        const codeEntries = groups.get(code);
        const sampleOutput = codeEntries.map(e =>
            `${e.severity === 'error' ? 'Error' : 'Warning'}: "${e.file}", line ${e.line}: (${e.code})\n  "${e.message}"`
        ).join('\n');

        if (files && files.length > 0) {
            for (const f of files) {
                batchEntries.push({ code, bsc_output: sampleOutput, files: f, file: f, source: 'bsc', session_id: sessionId });
            }
        } else {
            const inferredFiles = [...new Set(codeEntries.map(e => e.file).filter(Boolean))];
            if (inferredFiles.length > 0) {
                for (const f of inferredFiles) {
                    batchEntries.push({ code, bsc_output: sampleOutput, files: f, file: f, source: 'bsc', session_id: sessionId });
                }
            } else {
                batchEntries.push({ code, bsc_output: sampleOutput, source: 'bsc', session_id: sessionId });
            }
        }
    }
    if (batchEntries.length > 0) {
        try { await addCapturesBatch(batchEntries); } catch (_) { /* non-critical */ }
    }

    // ── 下一步建议 ──
    lines.push('---');
    lines.push('');
    lines.push('### 下一步');
    lines.push('');

    const autoFixable = knownCodes.filter(code => detectAutoFixability(kbResults.get(code)?.rules, code) === 'auto');
    const manualFix = knownCodes.filter(code => detectAutoFixability(kbResults.get(code)?.rules, code) === 'manual');

    if (autoFixable.length > 0) {
        const autoCounts = autoFixable.map(code => `${code} ×${groups.get(code).length}`).join(', ');
        lines.push(`- **[可自动修复]** ${autoCounts}: 语法级别的修复，按知识库建议操作即可`);
    }

    if (manualFix.length > 0) {
        const manualCounts = manualFix.map(code => `${code} ×${groups.get(code).length}`).join(', ');
        lines.push(`- **[需手动]** ${manualCounts}: 涉及设计决策，需分析代码逻辑后确定修复方案`);
    }

    if (unknownCodes.length > 0) {
        const unkCounts = unknownCodes.map(code => `${code} ×${groups.get(code).length}`).join(', ');
        lines.push(`- **[知识库未覆盖]** ${unkCounts}: 修复后请调 specmate_resolve 固化经验`);
    }

    lines.push(`- **[建议]** 修复后调 \`mcp__bsv-specmate__specmate_diff(action="snapshot")\` 存快照，追踪 warning 变化`);
    lines.push(`- **[建议]** 全部修复后调 \`mcp__bsv-specmate__specmate_check\` 做预编译静态检查`);

    return lines.join('\n');
}
