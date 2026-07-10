import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseFile, extractRules, findConflictPairs,
  analyzeRuleConflicts, findImplicitConflicts, extractAll,
} from './ast_query.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, '..', '..', 'test', 'fixtures');

function fixture(name) { return resolve(FIXTURES, name); }

describe('parseFile', () => {
  it('成功解析有效 .bsv 文件', () => {
    const result = parseFile(fixture('clean.bsv'));
    assert.ok(result);
    assert.ok(result.tree);
    assert.ok(result.source);
    assert.ok(result.source.includes('mkTestClean'));
  });

  it('对不存在的文件返回 null', () => {
    const result = parseFile(fixture('nonexistent.bsv'));
    assert.strictEqual(result, null);
  });
});

describe('extractRules', () => {
  it('从干净文件提取两个 rule', () => {
    const parsed = parseFile(fixture('clean.bsv'));
    const rules = extractRules(parsed.tree, parsed.source, fixture('clean.bsv'));
    assert.strictEqual(rules.length, 2);
    assert.strictEqual(rules[0].name, 'rule1');
    assert.strictEqual(rules[1].name, 'rule2');
  });

  it('从冲突文件提取一个 rule', () => {
    const parsed = parseFile(fixture('conflict-pairs.bsv'));
    const rules = extractRules(parsed.tree, parsed.source, fixture('conflict-pairs.bsv'));
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].name, 'testRule');
  });
});

describe('findConflictPairs', () => {
  it('检测同 rule 内两次写同一 reg', () => {
    const parsed = parseFile(fixture('conflict-pairs.bsv'));
    const conflicts = findConflictPairs(parsed.tree, parsed.source, fixture('conflict-pairs.bsv'));
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].rule, 'testRule');
    assert.strictEqual(conflicts[0].reg, 'regA');
    assert.strictEqual(conflicts[0].lines.length, 2);
  });

  it('干净文件无冲突', () => {
    const parsed = parseFile(fixture('clean.bsv'));
    const conflicts = findConflictPairs(parsed.tree, parsed.source, fixture('clean.bsv'));
    assert.strictEqual(conflicts.length, 0);
  });
});

describe('analyzeRuleConflicts', () => {
  it('检测跨 rule WAW — 两 rule 写同一 reg', () => {
    const parsed = parseFile(fixture('cross-rule-waw.bsv'));
    const result = analyzeRuleConflicts(parsed.tree, parsed.source, fixture('cross-rule-waw.bsv'));
    assert.strictEqual(result.rules.length, 2);
    const waw = result.conflicts.filter(c => c.type === 'WAW');
    assert.strictEqual(waw.length, 1);
    assert.strictEqual(waw[0].rule1, 'rule1');
    assert.strictEqual(waw[0].rule2, 'rule2');
    assert.strictEqual(waw[0].severity, 'high');
  });

  it('干净文件无跨 rule 冲突', () => {
    const parsed = parseFile(fixture('clean.bsv'));
    const result = analyzeRuleConflicts(parsed.tree, parsed.source, fixture('clean.bsv'));
    assert.strictEqual(result.conflicts.length, 0);
  });
});

describe('findImplicitConflicts', () => {
  it('检测 Wire 被两个 rule 驱动的隐式冲突', () => {
    const parsed = parseFile(fixture('wire-multi-driver.bsv'));
    const conflicts = findImplicitConflicts(parsed.tree, parsed.source, fixture('wire-multi-driver.bsv'));
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].wire, 'wA');
    assert.strictEqual(conflicts[0].writtenBy.length, 2);
    assert.strictEqual(conflicts[0].risk, 'medium');
  });

  it('干净文件无 Wire 冲突', () => {
    const parsed = parseFile(fixture('clean.bsv'));
    const conflicts = findImplicitConflicts(parsed.tree, parsed.source, fixture('clean.bsv'));
    assert.strictEqual(conflicts.length, 0);
  });
});

describe('extractAll', () => {
  it('批量提取干净文件所有结构', () => {
    const result = extractAll(fixture('clean.bsv'));
    assert.ok(!result.error);
    assert.ok(result.modules.length >= 1);
    assert.ok(result.rules.length >= 2);
    assert.ok(result.registers.length >= 2);
  });
});
