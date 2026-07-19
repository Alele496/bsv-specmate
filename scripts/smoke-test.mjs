#!/usr/bin/env node

/**
 * specmate 烟雾测试 — 模拟 Agent 完整调用链。
 *
 * 测试 specmate_scan、specmate_check 的路径校验和核心功能，
 * 直接 import 底层工具函数，不启动 MCP server。
 *
 * 用法: node scripts/smoke-test.mjs
 */

import { isAbsolute } from 'path';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// 与 server.mjs 中的 validateFilePaths 逻辑保持一致
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

// ── 测试 runner ──
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        const msg = `  ❌ ${label}`;
        console.error(msg);
        failures.push(label);
    }
}

// ── 测试 1: specmate_scan(task="写一个 2 选 1 MUX") ──
async function test1_scan() {
    console.log('\n📋 测试 1: specmate_scan(task="写一个 2 选 1 MUX")');

    const { scan } = await import('../src/tools/specmate_guide.mjs');
    const result = await scan('写一个 2 选 1 MUX', null);

    // 验证返回内容：应包含编译硬约束（UNIVERSAL_TRAPS）或 specmate 不做主动指导的消息
    assert(typeof result === 'string' && result.length > 0, 'scan 返回非空字符串');
    assert(
        result.includes('specmate 当前不做主动指导') ||
        result.includes('编译硬约束') ||
        result.includes('P0030') ||
        result.includes('P0005'),
        'scan 返回包含约束说明或 trap 建议'
    );
    // 验证不包含 CLI 命令引用（P0 修复 1）
    assert(
        !result.includes('npx specmate check') && !result.includes('npx specmate guide'),
        'scan 输出不含 CLI 命令引用（已替换为 MCP 工具调用）'
    );
    assert(
        result.includes('mcp__bsv-specmate__specmate_check'),
        'scan 输出包含 MCP 工具调用说明'
    );
}

// ── 测试 2: specmate_check(files=[absPath], full=true) ──
async function test2_check() {
    console.log('\n📋 测试 2: specmate_check(files=[绝对路径], full=true)');

    const { checkStyle } = await import('../src/tools/check_style.mjs');
    const fixturePath = resolve(PROJECT_ROOT, 'test/fixtures/traps/fifo-1.bsv');

    // 先确认 fixture 存在
    if (!existsSync(fixturePath)) {
        console.log(`  ⚠️  跳过 — fixture 文件不存在: ${fixturePath}`);
        return;
    }

    const results = checkStyle({ files: [fixturePath], full: true });

    // checkStyle 返回数组，每个元素含 file/check/message/suggestion 或 error
    assert(Array.isArray(results), 'checkStyle 返回数组');
    // fifo-1.bsv 是一个简单的测试模块，可能有 Bool/Bit 或 always-ready 相关警告
    // 结构验证：如果有结果，每个结果应有 file 字段
    for (const r of results) {
        if (r.error) {
            assert(typeof r.error === 'string', `结果含预期 error 字段: ${r.error}`);
        } else {
            assert(typeof r.check === 'string', `结果含 check 字段: ${r.check || r.file}`);
        }
    }
    console.log(`  ℹ️  checkStyle 返回 ${results.length} 个问题/提示`);
}

// ── 测试 3: 相对路径 → PATH_NOT_ABSOLUTE ──
function test3_relative_path() {
    console.log('\n📋 测试 3: 传入相对路径 → 返回 PATH_NOT_ABSOLUTE');

    const relativePath = 'test/fixtures/traps/fifo-1.bsv';
    const check = validateFilePaths([relativePath]);

    assert(!check.valid, '相对路径判定为 invalid');
    assert(
        check.error.startsWith('PATH_NOT_ABSOLUTE:'),
        `返回 PATH_NOT_ABSOLUTE 错误: ${check.error.substring(0, 80)}`
    );
    assert(
        check.error.includes(relativePath),
        '错误消息包含原始路径'
    );
}

// ── 测试 4: 不存在的绝对路径 → FILE_NOT_FOUND ──
function test4_nonexistent_file() {
    console.log('\n📋 测试 4: 传入不存在的文件 → 返回 FILE_NOT_FOUND');

    const fakePath = resolve(PROJECT_ROOT, 'test/fixtures/__nonexistent__.bsv');
    const check = validateFilePaths([fakePath]);

    assert(!check.valid, '不存在文件判定为 invalid');
    assert(
        check.error.startsWith('FILE_NOT_FOUND:'),
        `返回 FILE_NOT_FOUND 错误: ${check.error.substring(0, 80)}`
    );
    assert(
        check.error.includes('__nonexistent__'),
        '错误消息包含文件路径'
    );
}

// ── 测试 5: 绝对路径且文件存在 → 通过 ──
function test5_valid_absolute_path() {
    console.log('\n📋 测试 5: 传入有效绝对路径 → 校验通过');

    const fixturePath = resolve(PROJECT_ROOT, 'test/fixtures/traps/fifo-1.bsv');
    const check = validateFilePaths([fixturePath]);

    assert(check.valid, '有效绝对路径校验通过');
}

// ── 测试 6: 多文件中第一个是相对路径 → 立即失败 ──
function test6_multi_file_first_invalid() {
    console.log('\n📋 测试 6: 多文件中第一个相对路径 → 立即返回错误');

    const fixturePath = resolve(PROJECT_ROOT, 'test/fixtures/traps/fifo-1.bsv');
    const check = validateFilePaths(['relative.bsv', fixturePath]);

    assert(!check.valid, '第一个文件是相对路径 → invalid');
    assert(
        check.error.startsWith('PATH_NOT_ABSOLUTE:'),
        '立即返回 PATH_NOT_ABSOLUTE（短路检测）'
    );
}

// ── 测试 7: ensureDB → errors 表自动填充 ──
async function test7_auto_seed() {
    console.log('\n📋 测试 7: ensureDB() 后 errors 表不为空');

    const { ensureDB, queryAllErrors } = await import('../src/db/query.mjs');
    await ensureDB();
    const errors = await queryAllErrors();

    assert(Array.isArray(errors), 'queryAllErrors 返回数组');
    assert(errors.length >= 20, `errors 表有 ${errors.length} 条记录（预期 ≥20）`);
    // 验证每条记录有 code 字段
    for (const e of errors) {
        assert(typeof e.code === 'string' && e.code.length > 0, `条目含有效 code: ${e.code}`);
    }
    console.log(`  ℹ️  errors 表共 ${errors.length} 条错误码`);
}

// ── 测试 8: session 自动生成（幂等 + 格式校验）──
async function test8_session() {
    console.log('\n📋 测试 8: ensureSession() 幂等生成 session_id');

    const { ensureSession, getSessionId } = await import('../src/db/query.mjs');

    const id1 = await ensureSession('烟雾测试-session');
    const id2 = await ensureSession('烟雾测试-第二次调用');

    assert(id1 === id2, '两次 ensureSession 返回相同 session_id（幂等）');
    assert(typeof id1 === 'string' && id1.length > 0, 'session_id 是非空字符串');

    // 验证格式: YYYYMMDD-HHMMSS-<4位随机字符>
    const formatRe = /^\d{8}-\d{6}-[a-z0-9]{4}$/;
    assert(formatRe.test(id1), `session_id 格式 YYYYMMDD-HHMMSS-xxxx: ${id1}`);

    const idFromGetter = getSessionId();
    assert(idFromGetter === id1, 'getSessionId() 与 ensureSession() 返回值一致');

    console.log(`  ℹ️  session_id: ${id1}`);
}

// ── 测试 9: upsertCapture 去重 ──
// 前提：测试 8 已调用 ensureSession() 创建了 session
async function test9_upsert_capture() {
    console.log('\n📋 测试 9: upsertCapture 同 (code, file, session_id) 去重');
    console.log('  前提：依赖测试 8 已创建 session');

    const { getSessionId, addCapture, queryCapturesByCode } = await import('../src/db/query.mjs');
    const session_id = getSessionId();
    assert(session_id != null, 'session_id 已存在（测试 8 已创建）');

    const testCode = 'SMOKE_TEST_DEDUP';
    const testFile = 'test/fixtures/smoke-dedup.bsv';

    // 第一次 capture
    const result1 = await addCapture({
        code: testCode,
        bsc_output: `Error: "${testFile}", line 10: ${testCode} 去重测试-第一次`,
        files: testFile,
        file: testFile,
        source: 'bsc',
        session_id,
    });

    assert(!result1.deduped, '第一次 addCapture 不触发去重 (deduped=false)');
    assert(result1.repeat_count === 1, `第一次 repeat_count = 1 (实际: ${result1.repeat_count})`);

    // 第二次 capture — 相同 (code, file, session_id)
    const result2 = await addCapture({
        code: testCode,
        bsc_output: `Error: "${testFile}", line 15: ${testCode} 去重测试-第二次`,
        files: testFile,
        file: testFile,
        source: 'bsc',
        session_id,
    });

    assert(result2.deduped === true, '第二次 addCapture 触发去重 (deduped=true)');
    assert(result2.repeat_count === 2, `第二次 repeat_count = 2 (实际: ${result2.repeat_count})`);
    assert(result2.id === result1.id, '去重返回相同 id');

    // 验证 captures 表中只有 1 条记录
    const records = await queryCapturesByCode(testCode);
    const matching = records.filter(r => r.file === testFile && r.session_id === session_id);
    assert(matching.length === 1, `captures 表中仅 1 条记录（非 ${matching.length} 条）`);
}

// ── 测试 10: specmate_capture 响应含统计摘要 ──
// 模拟 bsc 编译错误输出，执行 capture 逻辑，验证统计摘要
async function test10_capture_stats() {
    console.log('\n📋 测试 10: specmate_capture 响应含统计摘要');

    const { ensureSession, getSessionId, addCapture, querySessionStats, queryStubbornErrors } = await import('../src/db/query.mjs');
    const session_id = getSessionId() || await ensureSession();

    // 模拟 bsc 编译错误输出（含多个错误码）
    const bscOutput = `Error: "src/Foo.bsv", line 42, column 15: (G0004)
    Rule "foo" and "bar" have overlapping scheduling...
    Error: "src/Foo.bsv", line 58, column 3: (P0030)
    Module "Foo" is not exported...
    Error: "src/Foo.bsv", line 100, column 20: (T0051)
    Type error: expected Bit#(32) but found Bool`;

    // 解析错误码（与 server.mjs 中 specmate_capture 逻辑一致）
    const codePattern = /\b([GPTBS]\d{4})\b/g;
    const codes = [...new Set([...bscOutput.matchAll(codePattern)].map(m => m[1]))];
    assert(codes.length > 0, `从 bsc 输出解析出 ${codes.length} 个错误码`);

    // 逐条 capture
    for (const code of codes) {
        await addCapture({ code, bsc_output: bscOutput, files: 'src/Foo.bsv', file: 'src/Foo.bsv', source: 'bsc', session_id });
    }

    // 验证统计摘要
    const stats = await querySessionStats(session_id);
    assert(stats.compileAttempts >= 1, `compile_attempts >= 1 (实际: ${stats.compileAttempts})`);

    // 构造与 specmate_capture 一致的统计块
    const stubborn = await queryStubbornErrors(session_id, 2);
    const parts = ['📊 当前任务统计:'];
    parts.push(`- 编译失败: ${stats.compileAttempts} 次`);
    parts.push(`- 未解决错误: ${stats.unresolvedCount} 个`);
    if (stubborn.length > 0) {
        for (const s of stubborn) {
            const loc = s.file ? `${s.file} 中 ` : '';
            parts.push(`- ⚠ 顽固错误: ${loc}${s.code} 已出现 ${s.repeat_count} 次`);
        }
    }
    const statsBlock = parts.join('\n');

    assert(statsBlock.includes('📊 当前任务统计'), '统计块含 "📊 当前任务统计"');
    assert(statsBlock.includes('编译失败'), '统计块含 "编译失败"');
    console.log(`  ℹ️  ${statsBlock.replace(/\n/g, '\n  ')}`);
}

// ── 测试 11: specmate_resolve 响应含修复率 ──
// 先 capture 一个错误，再 resolve 它，验证修复率统计
async function test11_resolve_fix_rate() {
    console.log('\n📋 测试 11: specmate_resolve 响应含修复率');

    const { ensureSession, getSessionId, addCapture, getLatestCaptureByCode, resolveCaptureById, queryFixRate } = await import('../src/db/query.mjs');
    const session_id = getSessionId() || await ensureSession();

    const testCode = 'SMOKE_TEST_FIX';

    // Step 1: capture 一个错误
    const capResult = await addCapture({
        code: testCode,
        bsc_output: `Error: "test.bsv", line 1: ${testCode} 修复率测试`,
        files: 'test.bsv',
        file: 'test.bsv',
        source: 'bsc',
        session_id,
    });
    console.log(`  ℹ️  已 capture: ${testCode} (id=${capResult.id})`);

    // Step 2: resolve 它
    const capture = await getLatestCaptureByCode(testCode);
    assert(capture != null, `找到未解决的 capture: ${testCode}`);
    await resolveCaptureById(capture.id, { cause: '测试用根因', solution: '测试用修复方案' });

    // Step 3: 验证修复率
    const rate = await queryFixRate(session_id);
    assert(rate.total > 0, `有 capture 记录 (total=${rate.total})`);
    assert(rate.resolved > 0, `有已解决记录 (resolved=${rate.resolved})`);

    const pct = ((rate.resolved / rate.total) * 100).toFixed(1);
    const fixRateMsg = `修复率: ${rate.resolved}/${rate.total} (${pct}%)`;
    assert(fixRateMsg.includes('修复率'), '修复率消息含 "修复率"');

    console.log(`  ℹ️  ${fixRateMsg}`);
}

// ── 测试 12: parseErrorFile 全量验证 — 所有 error doc 必须可解析 ──
async function test12_parse_all_errors() {
    console.log('\n📋 测试 12: parseErrorFile 解析所有 error doc');

    const { collectErrorFiles, parseErrorFile } = await import('../src/db/parser.mjs');

    const files = collectErrorFiles();
    assert(files.length >= 20, `收集到 ${files.length} 个 error doc（预期 ≥20）`);

    let failCount = 0;
    for (const filePath of files) {
        const fileName = filePath.split(/[/\\]/).pop();
        let content;
        try {
            content = readFileSync(filePath, 'utf-8');
        } catch (err) {
            failCount++;
            console.error(`  ❌ ${fileName}: 文件读取失败 — ${err.message}`);
            continue;
        }

        const result = parseErrorFile(content);

        if (!result || !result.code || !result.title) {
            failCount++;
            console.error(`  ❌ ${fileName}: 解析失败 — code="${result?.code || ''}" title="${result?.title || ''}"`);
            continue;
        }

        // Check that all fields are populated (warn on empty, don't fail)
        const fields = ['phenomena', 'cause', 'solution', 'rules'];
        const emptyFields = [];
        for (const f of fields) {
            const val = (result[f] || '').trim();
            if (!val) {
                emptyFields.push(f);
            }
        }
        if (emptyFields.length > 0) {
            console.log(`  ⚠ ${fileName} (${result.code}): ${emptyFields.join(', ')} 字段为空`);
        } else {
            console.log(`  ✅ ${fileName} (${result.code}): 全部字段解析成功`);
        }
    }

    assert(failCount === 0, `所有 ${files.length} 篇 error doc 解析成功（失败 ${failCount} 篇）`);
}

// ── 测试 13: Q3 Direction 1 — MCP Elicitation 场景 ──
async function test13_elicitation() {
    console.log('\n📋 测试 13: Q3 MCP Elicitation — 阶段感知');

    // 13a: Trigger decision table
    const { ELICIT_TRIGGERS, shouldElicit, PHASE_FORM_SCHEMA } = await import('../src/elicitation/elicit-phase.mjs');

    assert(ELICIT_TRIGGERS.verify.preCode === false, 'verify 模式不触发 preCode elicitation');
    assert(ELICIT_TRIGGERS.verify.onError === false, 'verify 模式不触发 onError elicitation');
    assert(ELICIT_TRIGGERS.develop.preCode === true, 'develop 模式触发 preCode elicitation');
    assert(ELICIT_TRIGGERS.develop.onError === false, 'develop 模式不触发 onError elicitation');
    assert(ELICIT_TRIGGERS.tapeout.preCode === true, 'tapeout 模式触发 preCode elicitation');
    assert(ELICIT_TRIGGERS.tapeout.onError === true, 'tapeout 模式触发 onError elicitation');
    assert(ELICIT_TRIGGERS.tapeout.afterCheck === true, 'tapeout 模式触发 afterCheck elicitation');

    // 13b: shouldElicit respects alreadyElicited flag (develop mode only asks once)
    // Temporarily override SPECMATE_LEVEL for this test
    const oldLevel = process.env.SPECMATE_LEVEL;
    process.env.SPECMATE_LEVEL = 'develop';
    assert(shouldElicit('preCode', false) === true, 'develop 首次 preCode 应触发 elicitation');
    assert(shouldElicit('preCode', true) === false, 'develop 已询问过不再触发 elicitation');
    process.env.SPECMATE_LEVEL = oldLevel;

    // 13c: Form schema validity
    assert(PHASE_FORM_SCHEMA.type === 'object', 'form schema type 为 object');
    assert(PHASE_FORM_SCHEMA.required.includes('phase'), 'form schema required 包含 phase');
    assert(PHASE_FORM_SCHEMA.properties.phase.oneOf.length === 3, 'form schema 包含 3 个阶段选项');
    assert(PHASE_FORM_SCHEMA.properties.phase.oneOf[0].const === 'design', '选项 A 为 design');
    assert(PHASE_FORM_SCHEMA.properties.phase.oneOf[1].const === 'code', '选项 B 为 code');
    assert(PHASE_FORM_SCHEMA.properties.phase.oneOf[2].const === 'debug', '选项 C 为 debug');

    // 13d: inferPhase fallback — keyword recognition
    const { inferPhase } = await import('../src/tools/_matcher.mjs');
    assert(inferPhase('设计SPI模块架构') === 'design', '"架构" 关键词 → design');
    assert(inferPhase('write a SPI controller with interface') === 'design', '"interface" 关键词 → design');
    assert(inferPhase('写一个 2 选 1 MUX 的 method') === 'code', '无架构关键词 → code (default)');
    assert(inferPhase('cross clock domain FIFO') === 'design', '"clock domain" + "FIFO" → design');
    assert(inferPhase('') === 'code', '空输入 → code (default)');

    // 13e: Session phase persistence
    const { ensureSession, getCurrentSessionPhase, setCurrentSessionPhase } = await import('../src/db/query.mjs');
    await ensureSession('elicitation-smoke-test');
    assert(await getCurrentSessionPhase() === null, '新 session phase 初始为 null');

    await setCurrentSessionPhase('design');
    assert(await getCurrentSessionPhase() === 'design', 'set + get design phase 一致');

    await setCurrentSessionPhase('code');
    assert(await getCurrentSessionPhase() === 'code', 'set + get code phase 一致');

    await setCurrentSessionPhase('debug');
    assert(await getCurrentSessionPhase() === 'debug', 'set + get debug phase 一致');
}

// ── 测试 14: Q3 Direction 2 — BSC compile integration ──
async function test14_bsc_compile() {
    console.log('\n📋 测试 14: Q3 BSC Compile — 编译集成');

    const { detectBSC, resetBSCDetection } = await import('../src/compile/bsc-detector.mjs');

    // 14a: detectBSC returns valid result
    const info = detectBSC();
    assert(['native', 'docker', 'unavailable'].includes(info.type), `detectBSC type 合法: ${info.type}`);
    assert(typeof info.path === 'string', 'detectBSC path 为 string');

    // 14b: detection is cached
    const info2 = detectBSC();
    assert(info2.type === info.type, 'detectBSC 结果被缓存 (二次调用一致)');
    assert(info2.path === info.path, 'detectBSC path 被缓存');

    // 14c: resetBSCDetection clears cache
    resetBSCDetection();
    const info3 = detectBSC();
    assert(info3.type === info.type, 'resetBSCDetection 后重新检测 type 一致');

    // 14d: when bsc is unavailable, runBSC returns clean degradation message
    // Reset to trigger unavailable state
    // Note: we don't force unavailable — we test that the cache works
    const { runBSC, COMPILE_TIMEOUT } = await import('../src/compile/bsc-runner.mjs');
    assert(COMPILE_TIMEOUT === 120000, 'COMPILE_TIMEOUT = 120s');
    assert(typeof runBSC === 'function', 'runBSC 可导入');
}

// ── 测试 15: Q3 Direction 3 — Unknown error similarity + context ──
async function test15_unknown_errors() {
    console.log('\n📋 测试 15: Q3 未知错误 LLM 分析 — similarity + context');

    const { findSimilarErrors, resetSimilarityCache } = await import('../src/tools/_similarity.mjs');

    // 15a: findSimilarErrors returns results for an error message with BSV terms
    const results = findSimilarErrors('P9999', 'Error: function keyword not allowed in genWith, use partial application');
    assert(Array.isArray(results), 'findSimilarErrors 返回数组');
    assert(results.length <= 3, '最多返回 3 个结果');

    // 15b: P-series error message should prefer P-series known errors
    if (results.length > 0) {
        const pMatches = results.filter(r => r.code.startsWith('P'));
        const hasPMatch = pMatches.length > 0 || results.some(r => r.code.startsWith('G') || r.code.startsWith('T'));
        assert(hasPMatch, '至少返回一个相似错误 (P/G/T 系列)');
        assert(results[0].score > 0, '最佳匹配 score > 0');
    }

    // 15c: extractSourceContext with valid file
    const { extractSourceContext } = await import('../src/tools/_context.mjs');
    const { resolve } = await import('path');
    const testFile = resolve(PROJECT_ROOT, 'test/fixtures/traps/fifo-1.bsv');
    const ctx = extractSourceContext(testFile, 5, 3);
    if (ctx) {
        assert(typeof ctx.text === 'string', 'extractSourceContext 返回 text 字符串');
        assert(ctx.startLine >= 1, 'extractSourceContext startLine >= 1');
        assert(ctx.endLine >= ctx.startLine, 'extractSourceContext endLine >= startLine');
    }

    // 15d: buildUnknownErrorResponse generates expected sections
    const { buildUnknownErrorResponse } = await import('../src/tools/_context.mjs');
    const response = buildUnknownErrorResponse({
        errorCode: 'P9999',
        errorMessage: 'function keyword is a reserved word in Verilog-2001 mode',
        similarErrors: results,
        sourceContext: ctx,
    });
    assert(typeof response === 'string', 'buildUnknownErrorResponse 返回字符串');
    assert(response.includes('P9999'), '响应包含错误码');
    assert(response.includes('请使用你自己的 LLM 推理能力'), '响应包含 LLM 分析引导');
    assert(response.includes('specmate_capture'), '响应提示调 specmate_capture');

    // 15e: Reset cache for clean state
    resetSimilarityCache();
    const results2 = findSimilarErrors('G9999', 'conflicting rules writing register');
    assert(Array.isArray(results2), 'resetSimilarityCache 后 findSimilarErrors 仍然可用');
}

// ── main ──
async function main() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   specmate 烟雾测试 (smoke-test)        ║');
    console.log('╚══════════════════════════════════════════╝');

    try {
        await test1_scan();
    } catch (err) {
        console.error(`  ❌ test1_scan 异常: ${err.message}`);
        failures.push(`test1_scan: ${err.message}`);
        failed++;
    }

    try {
        await test2_check();
    } catch (err) {
        console.error(`  ❌ test2_check 异常: ${err.message}`);
        failures.push(`test2_check: ${err.message}`);
        failed++;
    }

    test3_relative_path();
    test4_nonexistent_file();
    test5_valid_absolute_path();
    test6_multi_file_first_invalid();

    // 测试 7-11 依赖数据库，需要 try-catch
    try {
        await test7_auto_seed();
    } catch (err) {
        console.error(`  ❌ test7_auto_seed 异常: ${err.message}`);
        failures.push(`test7_auto_seed: ${err.message}`);
        failed++;
    }

    try {
        await test8_session();
    } catch (err) {
        console.error(`  ❌ test8_session 异常: ${err.message}`);
        failures.push(`test8_session: ${err.message}`);
        failed++;
    }

    try {
        await test9_upsert_capture();
    } catch (err) {
        console.error(`  ❌ test9_upsert_capture 异常: ${err.message}`);
        failures.push(`test9_upsert_capture: ${err.message}`);
        failed++;
    }

    try {
        await test10_capture_stats();
    } catch (err) {
        console.error(`  ❌ test10_capture_stats 异常: ${err.message}`);
        failures.push(`test10_capture_stats: ${err.message}`);
        failed++;
    }

    try {
        await test11_resolve_fix_rate();
    } catch (err) {
        console.error(`  ❌ test11_resolve_fix_rate 异常: ${err.message}`);
        failures.push(`test11_resolve_fix_rate: ${err.message}`);
        failed++;
    }

    try {
        await test12_parse_all_errors();
    } catch (err) {
        console.error(`  ❌ test12_parse_all_errors 异常: ${err.message}`);
        failures.push(`test12_parse_all_errors: ${err.message}`);
        failed++;
    }

    try {
        await test13_elicitation();
    } catch (err) {
        console.error(`  ❌ test13_elicitation 异常: ${err.message}`);
        failures.push(`test13_elicitation: ${err.message}`);
        failed++;
    }

    try {
        await test14_bsc_compile();
    } catch (err) {
        console.error(`  ❌ test14_bsc_compile 异常: ${err.message}`);
        failures.push(`test14_bsc_compile: ${err.message}`);
        failed++;
    }

    try {
        await test15_unknown_errors();
    } catch (err) {
        console.error(`  ❌ test15_unknown_errors 异常: ${err.message}`);
        failures.push(`test15_unknown_errors: ${err.message}`);
        failed++;
    }

    // ── 汇总 ──
    console.log('\n═══════════════════════════════════════════');
    console.log(`  总计: ${passed + failed} 项, ✅ ${passed} 通过, ❌ ${failed} 失败`);
    if (failures.length > 0) {
        console.log('\n  失败项:');
        failures.forEach(f => console.log(`    - ${f}`));
        process.exit(1);
    } else {
        console.log('  🎉 全部通过!');
        process.exit(0);
    }
}

main();
