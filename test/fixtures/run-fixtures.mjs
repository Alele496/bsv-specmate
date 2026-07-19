#!/usr/bin/env node
/**
 * run-fixtures.mjs — validate check rules against fixture files.
 *
 * For each check rule in test/fixtures/check/<rule>/:
 *   - Read fail.bsv → run specmate check → verify the expected issue IS detected
 *   - Read pass.bsv → run specmate check → verify NO false positives
 *
 * For traps (future): bsc compile fixture to verify correctness.
 *
 * Usage: node test/fixtures/run-fixtures.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkStyle } from '../../src/tools/check_style.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECK_DIR = join(__dirname, 'check');

// Expected issue check IDs for each rule
const EXPECTED_CHECKS = {
    'bool-interface-return': ['interface-bool-return', 'interface-bool-param'],
    'always-attr-misuse': ['always-attr-guard-conflict', 'always-attr-cond-body'],
    'G0054': ['G0054'],
    'G0053': ['G0053'],
    'P0022': ['P0022'],
    'P0200': ['P0200'],
    'synthesize-annotation-order': ['G0010'],
    'G0004': ['G0004'],
    'G0004-false-positive': ['G0004'],
};

function runFixtures() {
    if (!existsSync(CHECK_DIR)) {
        console.log('No check fixture directory found. Skipping.');
        return;
    }

    const rules = readdirSync(CHECK_DIR).filter(d => {
        try { return statSync(join(CHECK_DIR, d)).isDirectory(); } catch (_) { return false; }
    });

    if (rules.length === 0) {
        console.log('No check fixtures found.');
        return;
    }

    let passCount = 0;
    let failCount = 0;
    const results = [];

    for (const rule of rules) {
        const ruleDir = join(CHECK_DIR, rule);
        const passFile = join(ruleDir, 'pass.bsv');
        const failFile = join(ruleDir, 'fail.bsv');
        const expectedChecks = EXPECTED_CHECKS[rule] || [];

        // ── Test fail.bsv: should detect the expected issue ──
        if (existsSync(failFile)) {
            const issues = checkStyle({ files: [failFile], full: true });
            const checkIds = issues.map(i => i.check);
            const found = expectedChecks.some(ec => checkIds.includes(ec));

            if (found) {
                console.log(`  [PASS] ${rule}/fail.bsv — detected expected issue(s): ${checkIds.filter(c => expectedChecks.includes(c)).join(', ')}`);
                results.push({ rule, fixture: 'fail.bsv', status: 'PASS' });
                passCount++;
            } else {
                const issueList = checkIds.length > 0 ? checkIds.join(', ') : '(none)';
                console.log(`  [FAIL] ${rule}/fail.bsv — expected ${expectedChecks.join(' or ')}, got: ${issueList}`);
                results.push({ rule, fixture: 'fail.bsv', status: 'FAIL', expected: expectedChecks, got: checkIds });
                failCount++;
            }
        }

        // ── Test pass.bsv: should NOT produce false positives ──
        if (existsSync(passFile)) {
            const issues = checkStyle({ files: [passFile], full: true });
            const checkIds = issues.map(i => i.check);
            const falsePositives = checkIds.filter(c => expectedChecks.includes(c));

            if (falsePositives.length === 0) {
                console.log(`  [PASS] ${rule}/pass.bsv — no false positives`);
                results.push({ rule, fixture: 'pass.bsv', status: 'PASS' });
                passCount++;
            } else {
                console.log(`  [FAIL] ${rule}/pass.bsv — false positive: ${falsePositives.join(', ')}`);
                // Show the false positive details
                for (const fp of issues.filter(i => expectedChecks.includes(i.check))) {
                    console.log(`    Line ${fp.line}: [${fp.check}] ${fp.message}`);
                }
                results.push({ rule, fixture: 'pass.bsv', status: 'FAIL', falsePositives });
                failCount++;
            }
        }
    }

    // ── Summary ──
    console.log('');
    console.log('='.repeat(60));
    console.log(`Results: ${passCount} passed, ${failCount} failed, ${passCount + failCount} total`);
    console.log('='.repeat(60));

    if (failCount > 0) {
        console.log('');
        console.log('FAILURES:');
        for (const r of results.filter(r => r.status === 'FAIL')) {
            console.log(`  ${r.rule}/${r.fixture}`);
        }
        process.exit(1);
    }
}

runFixtures();
