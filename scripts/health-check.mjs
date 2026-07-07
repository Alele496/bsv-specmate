#!/usr/bin/env node
/**
 * bsv-specmate 健康巡检
 *
 * 用法: node scripts/health-check.mjs [--json]
 *
 * 检查维度:
 *   1. Git 状态 — 未提交改动、未推送提交、分支状态
 *   2. 测试 — npm test 结果
 *   3. 数据库 — 错误记忆库大小、capture 未解决数、快照数
 *   4. 依赖 — 过时包、已知漏洞
 *   5. 文件 — 最近修改、大文件
 *
 * 输出: 默认写入 docs/health-check.md 并打印摘要到 stdout
 *       --json 则输出 JSON 到 stdout
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORT_PATH = resolve(ROOT, 'docs', 'health-check.md');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');

// ── Helpers ──────────────────────────────────────────────

function sh(cmd, options = {}) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30_000, ...options });
    return { ok: true, stdout: out.trim(), stderr: '' };
  } catch (e) {
    return { ok: false, stdout: e.stdout?.trim() || '', stderr: e.stderr?.trim() || '', message: e.message };
  }
}

function check(label, fn) {
  try { return fn(); }
  catch (e) { return `❌ ${e.message}`; }
}

function color(status) {
  if (status === 'ok' || status === 'clean') return '🟢';
  if (status === 'warn') return '🟡';
  if (status === 'action') return '🔴';
  return '⚪';
}

// ── 1. Git ───────────────────────────────────────────────

function checkGit() {
  // Check if git repo exists
  const hasGit = existsSync(resolve(ROOT, '.git'));
  if (!hasGit) return { status: 'action', summary: '不是 git 仓库', details: [] };

  const status = sh('git status --porcelain');
  const branch = sh('git branch --show-current');
  const log = sh('git log --oneline -5');
  const remote = sh('git remote -v');

  // Uncommitted changes
  const dirtyFiles = status.stdout ? status.stdout.split('\n').filter(Boolean).map(l => l.replace(/^.{1,3}\s+/, '').trim()) : [];
  const uncommitted = dirtyFiles.length > 0;

  // Unpushed commits
  let unpushed = [];
  const currentBranch = branch.stdout;
  if (currentBranch && remote.stdout) {
    const ahead = sh(`git log --oneline @{u}..HEAD`);
    if (ahead.stdout) unpushed = ahead.stdout.split('\n').filter(Boolean);
  }

  // Stale branch (no remote tracking)
  const hasUpstream = sh('git rev-parse --abbrev-ref @{u}');

  const details = [];
  if (uncommitted) {
    details.push({ level: 'warn', text: `${dirtyFiles.length} 个文件有未提交改动` });
    details.push({ level: 'info', text: dirtyFiles.map(f => `  ${f}`).join('\n') });
  }
  if (unpushed.length > 0) {
    details.push({ level: 'warn', text: `${unpushed.length} 个提交未推送` });
    unpushed.forEach(c => details.push({ level: 'info', text: `  ${c}` }));
  }
  if (!hasUpstream.ok) {
    details.push({ level: 'warn', text: '当前分支未跟踪远程分支' });
  }

  if (uncommitted || unpushed.length > 0 || !hasUpstream.ok) {
    return { status: 'warn', summary: `${dirtyFiles.length} 未提交, ${unpushed.length} 未推送`, details };
  }
  return {
    status: 'clean',
    summary: '工作树干净，与远程同步',
    details: [`分支: ${currentBranch}`, log.stdout ? `最近提交:\n${log.stdout}` : ''].filter(Boolean),
  };
}

// ── 2. Tests ─────────────────────────────────────────────

function checkTests() {
  const hasTestScript = (() => {
    try {
      const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
      return !!pkg.scripts?.test;
    } catch { return false; }
  })();

  if (!hasTestScript) return { status: 'action', summary: 'package.json 中没有 test 脚本', details: [] };

  const result = sh('npm test', { timeout: 60_000 });
  if (result.ok) {
    // Extract pass/fail counts from node:test output
    // Format: "# pass 13" / "# fail 0"
    const passMatch = result.stdout.match(/# pass (\d+)/);
    const failMatch = result.stdout.match(/# fail (\d+)/);
    const pass = passMatch ? parseInt(passMatch[1]) : '?';
    const fail = failMatch ? parseInt(failMatch[1]) : 0;
    return {
      status: fail > 0 ? 'action' : 'ok',
      summary: `${pass} passed, ${fail} failed`,
      details: [result.stdout.split('\n').slice(-10).join('\n')],
    };
  }
  return { status: 'action', summary: '测试失败', details: [result.stderr || result.message] };
}

// ── 3. Database ──────────────────────────────────────────

async function checkDB() {
  // Dynamic import — sql.js is WASM, don't load if not needed
  try {
    const { ensureDB, queryAllErrors, queryUnresolvedCaptures, queryRecentCaptures, queryLatestSnapshots, closeDB } = await import('../src/db/query.mjs');

    const db = await ensureDB();
    if (!db) return { status: 'action', summary: '数据库无法初始化', details: [] };

    const errors = await queryAllErrors();
    const unresolved = await queryUnresolvedCaptures();
    const recent = await queryRecentCaptures(20);
    const snapshots = await queryLatestSnapshots(10);

    const details = [];
    details.push(`错误记忆库: ${errors.length} 条`);

    if (errors.length > 0) {
      const top = [...errors].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5);
      top.forEach(e => details.push(`  ${e.code} — ${e.title || '(未命名)'} (×${e.count})`));
    }

    details.push(`未解决 capture: ${unresolved.length} 条`);
    if (unresolved.length > 0) {
      unresolved.slice(0, 5).forEach(c => {
        details.push(`  ${c.code} — ${(c.bsc_output || '').substring(0, 60)}`);
      });
    }

    details.push(`近期 capture: ${recent.length} 条`);
    const resolved = recent.filter(c => c.status === 'resolved').length;
    if (recent.length > 0) {
      details.push(`  已解决: ${resolved}/${recent.length} (${Math.round(resolved / recent.length * 100)}%)`);
    }

    details.push(`Warning 快照: ${snapshots.length} 个`);

    closeDB();

    let status = 'ok';
    let summary = `${errors.length} 条记忆, ${unresolved.length} 未解决`;
    if (unresolved.length > 10) {
      status = 'warn';
      summary = `⚠ ${unresolved.length} 条 capture 待解决 — 建议逐个 review`;
    }
    if (!db) status = 'action';

    return { status, summary, details };
  } catch (e) {
    return { status: 'action', summary: `数据库检查失败: ${e.message}`, details: [] };
  }
}

// ── 4. Dependencies ──────────────────────────────────────

function checkDeps() {
  const outdated = sh('npm outdated --json', { timeout: 30_000 });

  // npm audit
  const audit = sh('npm audit --json', { timeout: 30_000 });

  const details = [];

  if (outdated.ok && outdated.stdout) {
    try {
      const parsed = JSON.parse(outdated.stdout);
      const deps = Object.entries(parsed);
      if (deps.length > 0) {
        details.push(`过时依赖: ${deps.length} 个`);
        deps.forEach(([name, info]) => {
          details.push(`  ${name}: ${info.current} → ${info.latest} (${info.type})`);
        });
      } else {
        details.push('所有依赖都是最新版本');
      }
    } catch { /* JSON parse failed, ignore */ }
  }

  if (audit.ok && audit.stdout) {
    try {
      const parsed = JSON.parse(audit.stdout);
      const vulns = parsed.vulnerabilities || {};
      const summary = parsed.metadata?.vulnerabilities || {};
      const total = (summary.critical || 0) + (summary.high || 0) + (summary.moderate || 0) + (summary.low || 0);
      if (total > 0) {
        details.push(`安全漏洞: ${total} 个 (critical: ${summary.critical || 0}, high: ${summary.high || 0}, moderate: ${summary.moderate || 0})`);
      } else {
        details.push('无已知安全漏洞');
      }
    } catch { /* JSON parse failed, ignore */ }
  }

  const status = details.some(d => d.includes('critical') || d.includes('high')) ? 'action' : 'ok';
  return { status, summary: details[0] || '依赖检查完成', details };
}

// ── 5. Files ─────────────────────────────────────────────

function checkFiles() {
  const details = [];

  // Find .mjs files modified within 7 days using Node.js (no Unix find/head)
  try {
    const recentFiles = [];
    const walkDir = (dir, depth = 0) => {
      if (depth > 4) return;
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); }
      catch { return; }
      for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walkDir(full, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
          try {
            const st = statSync(full);
            if ((Date.now() - st.mtimeMs) < 7 * 86400000) {
              recentFiles.push({ path: relative(ROOT, full), mtime: st.mtimeMs });
            }
          } catch { /* skip */ }
        }
      }
    };
    walkDir(resolve(ROOT, 'src'));

    if (recentFiles.length > 0) {
      recentFiles.sort((a, b) => b.mtime - a.mtime);
      details.push(`最近 7 天修改的源文件: ${recentFiles.length} 个`);
      for (const f of recentFiles.slice(0, 10)) {
        const days = Math.round((Date.now() - f.mtime) / 86400000);
        details.push(`  ${f.path} (${days}d ago)`);
      }
    } else {
      details.push('最近 7 天无源文件修改');
    }
  } catch (e) { details.push('文件扫描失败: ' + e.message); }

  // Check if spec vs implementation diverge
  const specPath = resolve(ROOT, '..', 'improvements', 'spec-p0-improvements.md');
  if (existsSync(specPath)) {
    const specStat = statSync(specPath);
    const specAge = Math.round((Date.now() - specStat.mtimeMs) / 86400000);
    if (specAge > 7) {
      details.push(`⚠ 规格文档 (spec-p0-improvements.md) ${specAge} 天未更新 — 可能与代码不一致`);
    }
  }

  // Check docs/health-check.md age (self-referential)
  if (existsSync(REPORT_PATH)) {
    const st = statSync(REPORT_PATH);
    const age = Math.round((Date.now() - st.mtimeMs) / 3600000);
    details.push(`上次巡检: ${age} 小时前`);
  } else {
    details.push('首次巡检');
  }

  return {
    status: 'ok',
    summary: `源文件检查完成`,
    details,
  };
}

// ── Aggregate & Report ────────────────────────────────────

async function run() {
  const now = new Date().toISOString();
  const checks = {};

  checks.git = checkGit();
  checks.tests = checkTests();
  checks.db = await checkDB();
  checks.deps = checkDeps();
  checks.files = checkFiles();

  // ── Overall assessment ──
  const statuses = Object.values(checks).map(c => c.status);
  const actions = statuses.filter(s => s === 'action').length;
  const warns = statuses.filter(s => s === 'warn').length;
  const oks = statuses.filter(s => s === 'ok' || s === 'clean').length;

  let overall;
  if (actions > 0) overall = 'NEEDS_ATTENTION';
  else if (warns > 1) overall = 'WARN';
  else overall = 'HEALTHY';

  // ── Build report ──
  const lines = [];

  lines.push('# 健康巡检');
  lines.push('');
  lines.push(`> 自动生成: ${now}`);
  lines.push(`> 综合评估: **${overall}**`);
  lines.push('');

  lines.push('## 总览');
  lines.push('');
  lines.push('| 项目 | 状态 | 摘要 |');
  lines.push('|------|------|------|');
  for (const [name, check] of Object.entries(checks)) {
    const labels = { git: 'Git 状态', tests: '测试', db: '数据库', deps: '依赖', files: '文件' };
    lines.push(`| ${labels[name] || name} | ${color(check.status)} | ${check.summary} |`);
  }
  lines.push('');

  for (const [name, check] of Object.entries(checks)) {
    const labels = { git: 'Git 状态', tests: '测试', db: '数据库', deps: '依赖', files: '文件' };
    lines.push(`## ${labels[name] || name}`);
    lines.push('');
    for (const d of check.details) {
      if (typeof d === 'string') {
        lines.push(d.startsWith('  ') ? d : `- ${d}`);
      } else {
        lines.push(`- ${color(d.level)} ${d.text}`);
      }
    }
    lines.push('');
  }

  // ── Actionable recommendations ──
  lines.push('## 建议操作');
  lines.push('');

  const recs = [];

  if (checks.git.status === 'action') {
    recs.push('- 🔴 **初始化 git 仓库**: `git init && git add -A && git commit -m "..."`');
  } else if (checks.git.status === 'warn') {
    const gitDetails = checks.git.details.map(d => typeof d === 'string' ? d : d.text).join(' ');
    if (gitDetails.includes('未提交')) recs.push('- 🟡 有未提交的改动，考虑 `git add` + `git commit`');
    if (gitDetails.includes('未推送')) recs.push('- 🟡 有未推送的提交，考虑 `git push`');
    if (gitDetails.includes('未跟踪')) recs.push('- 🟡 分支未跟踪远程，考虑 `git push -u`');
  }

  if (checks.tests.status === 'action') {
    recs.push('- 🔴 **测试失败** — 检查测试输出并修复');
  }

  if (checks.db.status === 'action') {
    recs.push('- 🔴 **数据库异常** — 检查 data/knowledge.db 文件是否损坏');
  } else if (checks.db.status === 'warn') {
    recs.push('- 🟡 未解决 capture 较多 — 逐条 `specmate_resolve` 清理');
  }

  if (checks.deps.status === 'action') {
    recs.push('- 🔴 **依赖有安全漏洞** — 运行 `npm audit fix`');
  } else if (checks.deps.status === 'warn') {
    recs.push('- 🟡 有过时依赖 — 可运行 `npm outdated` 查看');
  }

  if (recs.length === 0) {
    recs.push('- ✅ 无需立即操作，项目状态良好');
  }

  recs.push(`- 📋 下次自动巡检由 Cron 触发`);
  lines.push(recs.join('\n'));
  lines.push('');

  const report = lines.join('\n');

  // Write report
  writeFileSync(REPORT_PATH, report, 'utf-8');

  if (jsonMode) {
    console.log(JSON.stringify({ timestamp: now, overall, checks: Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, { status: v.status, summary: v.summary }])
    )}, null, 2));
  } else {
    console.log(report);
  }

  return { overall, checks };
}

run().catch(err => {
  console.error('健康巡检失败:', err.message);
  process.exit(1);
});
