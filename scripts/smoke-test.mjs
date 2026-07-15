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
import { existsSync } from 'fs';
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
