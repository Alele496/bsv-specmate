#!/usr/bin/env node

/**
 * specmate HTTP 集成测试 — 通过 HTTP 协议验证 Dashboard API。
 *
 * 核心流程：
 *   1. spawn server 子进程
 *   2. 轮询 /health 等待就绪
 *   3. 用内置 fetch 测试所有 API 端点
 *   4. 测试完成后 kill 子进程
 *
 * 零额外依赖，兼容空数据库场景。
 * 用法: node scripts/http-smoke-test.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const HOST = 'http://127.0.0.1:9339';
const STARTUP_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 500;

let serverProcess = null;
let passed = 0;
let failed = 0;
const failures = [];

// ── 工具函数 ──

function assert(condition, label) {
    if (condition) {
        passed++;
        console.log(`  PASS ${label}`);
    } else {
        failed++;
        console.error(`  FAIL ${label}`);
        failures.push(label);
    }
}

async function waitForHealth(maxWait = STARTUP_TIMEOUT_MS) {
    const deadline = Date.now() + maxWait;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${HOST}/health`);
            if (res.ok) {
                const body = await res.json();
                if (body.status === 'ok') return;
            }
        } catch {
            // 连接被拒，继续重试
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(`服务器在 ${maxWait}ms 内未就绪`);
}

function killServer() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
        setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
                serverProcess.kill();
            }
        }, 2000);
    }
}

// 进程退出时兜底
process.on('exit', () => killServer());
process.on('SIGINT', () => { killServer(); process.exit(0); });
process.on('SIGTERM', () => { killServer(); process.exit(0); });

// ── 测试用例 ──

async function runTests() {
    // ─── 启动服务器 ───
    console.log('[http-smoke] 启动服务器...');
    const serverScript = resolve(PROJECT_ROOT, 'bin/server.mjs');
    // stdin 必须为 'pipe' 并保持打开，否则 stdio transport 会收到 EOF 立即关闭服务器
    serverProcess = spawn(process.execPath, [serverScript], {
        cwd: PROJECT_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, SPECMATE_TRANSPORT: 'stdio' },
    });

    serverProcess.on('error', (err) => {
        console.error(`[http-smoke] server spawn error: ${err.message}`);
    });
    serverProcess.stdout.on('data', (data) => {
        process.stderr.write(`[server:out] ${data.toString().trim()}\n`);
    });
    serverProcess.stderr.on('data', (data) => {
        process.stderr.write(`[server:err] ${data.toString().trim()}\n`);
    });

    try {
        await waitForHealth();
        console.log('[http-smoke] 服务器就绪\n');
    } catch (err) {
        console.error(`[http-smoke] ${err.message}`);
        failures.push(`server startup: ${err.message}`);
        failed++;
        printSummary();
        process.exit(1);
    }

    // ─── 基础端点 ───
    console.log('── 基础端点 ──');

    {
        const res = await fetch(`${HOST}/health`);
        assert(res.status === 200, `GET /health → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(body.status === 'ok', `GET /health body.status === 'ok'`);
    }

    {
        const res = await fetch(`${HOST}/dashboard`);
        assert(res.status === 200, `GET /dashboard → 200 (实际: ${res.status})`);
        const ct = res.headers.get('Content-Type') || '';
        assert(ct.includes('text/html'), `GET /dashboard Content-Type 含 text/html (实际: ${ct})`);
    }

    // ─── /api/summary ───
    console.log('── /api/summary ──');

    {
        const res = await fetch(`${HOST}/api/summary`);
        assert(res.status === 200, `GET /api/summary → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(typeof body.totalSessions === 'number', `totalSessions 应为 number`);
        assert(typeof body.totalCaptures === 'number', `totalCaptures 应为 number`);
        assert(typeof body.knowledgeEntries === 'number', `knowledgeEntries 应为 number`);
        assert(body.totalSessions >= 0, `totalSessions >= 0 (${body.totalSessions})`);
        assert(body.totalCaptures >= 0, `totalCaptures >= 0 (${body.totalCaptures})`);
        assert(body.knowledgeEntries >= 0, `knowledgeEntries >= 0 (${body.knowledgeEntries})`);
    }

    // ─── /api/errors ───
    console.log('── /api/errors ──');

    {
        const res = await fetch(`${HOST}/api/errors`);
        assert(res.status === 200, `GET /api/errors → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body), `GET /api/errors 返回数组`);
    }

    {
        const res = await fetch(`${HOST}/api/errors/G0004`);
        assert(res.status === 200 || res.status === 404, `GET /api/errors/G0004 → 200或404 (实际: ${res.status})`);
        const body = await res.json();
        if (res.status === 200) {
            assert(!!body.error, `200 响应含 error 对象`);
            assert(Array.isArray(body.captures), `captures 为数组`);
        } else {
            assert(!!body.error, `404 响应含 error 消息`);
        }
    }

    {
        const res = await fetch(`${HOST}/api/errors/NONEXIST`);
        assert(res.status === 404, `GET /api/errors/NONEXIST → 404 (实际: ${res.status})`);
        const body = await res.json();
        assert(!!body.error, `404 响应含 error 消息`);
    }

    // ─── /api/sessions ───
    {
        const res = await fetch(`${HOST}/api/sessions`);
        assert(res.status === 200, `GET /api/sessions → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body), `GET /api/sessions 返回数组`);
    }

    // ─── /api/captures ───
    console.log('── /api/captures ──');

    {
        const res = await fetch(`${HOST}/api/captures?page=1&pageSize=10`);
        assert(res.status === 200, `GET /api/captures?page=1&pageSize=10 → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body.items), `items 应为数组`);
        assert(typeof body.total === 'number', `total 应为 number (${body.total})`);
        assert(typeof body.page === 'number', `page 应为 number (${body.page})`);
        assert(typeof body.pageSize === 'number', `pageSize 应为 number (${body.pageSize})`);
        assert(body.page === 1, `page === 1 (${body.page})`);
        assert(body.pageSize === 10, `pageSize === 10 (${body.pageSize})`);
    }

    // ─── 趋势端点 ───
    console.log('── 趋势端点 ──');

    {
        const res = await fetch(`${HOST}/api/trends/errors?granularity=week&topN=3`);
        assert(res.status === 200, `GET /api/trends/errors → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body.periods), `periods 应为数组`);
        assert(Array.isArray(body.series), `series 应为数组`);
    }

    {
        const res = await fetch(`${HOST}/api/trends/fix-rate`);
        assert(res.status === 200, `GET /api/trends/fix-rate → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body), `返回数组`);
    }

    {
        const res = await fetch(`${HOST}/api/trends/knowledge-growth`);
        assert(res.status === 200, `GET /api/trends/knowledge-growth → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body), `返回数组`);
    }

    // ─── /api/hotspots ───
    {
        const res = await fetch(`${HOST}/api/hotspots?topN=5`);
        assert(res.status === 200, `GET /api/hotspots?topN=5 → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body), `返回数组`);
    }

    // ─── /api/weekly-top-errors ───
    {
        const res = await fetch(`${HOST}/api/weekly-top-errors?topN=3&weeks=2`);
        assert(res.status === 200, `GET /api/weekly-top-errors → 200 (实际: ${res.status})`);
        const body = await res.json();
        assert(Array.isArray(body), `返回数组`);
    }

    // ─── /api/search ───
    console.log('── /api/search ──');

    {
        const res = await fetch(`${HOST}/api/search?q=rule`);
        assert(res.status === 200, `GET /api/search?q=rule → 200 (实际: ${res.status})`);
    }

    // ─── /api/export ───
    {
        const res = await fetch(`${HOST}/api/export`);
        assert(res.status === 200, `GET /api/export → 200 (实际: ${res.status})`);
        const ct = res.headers.get('Content-Type') || '';
        assert(ct.includes('application/json'), `Content-Type 含 application/json (实际: ${ct})`);
        const body = await res.json();
        assert(typeof body === 'object', `返回 JSON 对象`);
    }

    // ─── 参数校验 ───
    console.log('── 参数校验 ──');

    {
        const res = await fetch(`${HOST}/api/search`);
        assert(res.status === 400, `GET /api/search（无 q）→ 400 (实际: ${res.status})`);
        const body = await res.json();
        assert(!!body.error, `含 error 消息`);
    }

    {
        const res = await fetch(`${HOST}/api/trends/errors?granularity=week&topN=abc`);
        assert(res.status === 400, `GET /api/trends/errors?topN=abc → 400 (实际: ${res.status})`);
        const body = await res.json();
        assert(!!body.error, `含 error 消息`);
    }

    // ─── 不存在路由 ───
    {
        const res = await fetch(`${HOST}/api/nonexistent`);
        assert(res.status === 404 || res.status >= 400, `GET /api/nonexistent → 4xx (实际: ${res.status})`);
    }

    // ─── CORS 预检 ───
    console.log('── CORS 预检 ──');

    {
        const res = await fetch(`${HOST}/api/summary`, { method: 'OPTIONS' });
        const acao = res.headers.get('Access-Control-Allow-Origin');
        assert(!!acao, `OPTIONS /api/summary 含 Access-Control-Allow-Origin (值: ${acao || '无'})`);
    }

    // ── 清理 ──
    killServer();
    printSummary();
}

function printSummary() {
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  总计: ${passed + failed} 项, 通过: ${passed}, 失败: ${failed}`);
    if (failures.length > 0) {
        console.log('\n  失败项:');
        failures.forEach(f => console.log(`    - ${f}`));
        process.exitCode = 1;
    } else {
        console.log('  全部通过!');
    }
}

runTests();
