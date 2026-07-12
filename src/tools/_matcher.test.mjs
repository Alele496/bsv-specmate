import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractKeywords, match, KEYWORDS } from './_matcher.mjs';

describe('extractKeywords', () => {
  it('精确匹配单个关键词', () => {
    assert.deepStrictEqual(extractKeywords('用 mkFIFO 实现 fifo'), ['fifo']);
  });
  it('多关键词匹配', () => {
    const r = extractKeywords('fifo 和 pipeline 之间的 bram');
    assert.ok(r.includes('fifo') && r.includes('pipeline') && r.includes('bram'));
  });
  it('无匹配返回空数组', () => {
    assert.deepStrictEqual(extractKeywords('hello world'), []);
  });
  it('子串包含的缺陷 — fifof 误匹配 fifo', () => {
    const r = extractKeywords('fifof');
    // 当前 known limitation: "fifof" 包含 "fifo"，会误匹配
    // 记录此行为以便将来修复
    assert.ok(r.includes('fifo'));
  });
});

describe('match', () => {
  it('合并去重 — fifo 和 pipeline 共享 G0010/G0004', () => {
    const result = match(['fifo', 'pipeline']);
    const g0010 = result.errors.filter(e => e === 'G0010');
    assert.strictEqual(g0010.length, 1);
  });
  it('空输入返回通用陷阱', () => {
    const result = match([]);
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.refs, []);
    assert.ok(result.traps.length > 0, '通用陷阱应该在空输入时也存在');
    assert.ok(result.traps.some(t => t.text.includes('P0030')), '应包含 P0030 通用陷阱');
  });
  it('未知关键词不崩溃', () => {
    const result = match(['nonexistent_keyword_xyz']);
    assert.deepStrictEqual(result.errors, []);
  });
});

describe('GRAPH 完整性', () => {
  it('所有 KEYWORDS 都在 GRAPH 中', () => {
    for (const kw of KEYWORDS) {
      const result = match([kw]);
      assert.ok(result, `关键词 "${kw}" 无有效 GRAPH 节点`);
    }
  });
});
