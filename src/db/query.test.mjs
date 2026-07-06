import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ensureDB, closeDB, queryError, queryAllErrors, querySearch,
         hitError, queryTopRules, queryHotTopics, trackRefHit,
         addCapture, resolveCaptureById, queryCapturesByCode,
         queryRecentCaptures, queryUnresolvedCaptures } from './query.mjs';

describe('ensureDB', () => {
  after(() => closeDB());

  it('首次调用创建数据库', async () => {
    const db = await ensureDB();
    assert.ok(db);
  });
  it('二次调用返回同一实例', async () => {
    const db1 = await ensureDB();
    const db2 = await ensureDB();
    // sql.js Database 是同一引用
    assert.ok(db1);
    assert.ok(db2);
  });
});

describe('errors CRUD', () => {
  // 注意：测试写入前清空或使用测试专用 DB
  it('查询不存在的错误码返回 null', async () => {
    const r = await queryError('NONEXIST');
    assert.strictEqual(r, null);
  });
  it('热门错误排序正确', async () => {
    // 先 hit 几个错误增加计数
    await hitError('G0010');
    await hitError('G0010');
    await hitError('G0004');
    const top = await queryTopRules(3);
    assert.ok(top.length >= 2);
    assert.ok(top.some(e => e.code === 'G0010'), 'G0010 应在热门列表中');
  });
});

describe('captures 闭环', () => {
  it('insert → unresolved → resolve → gone', async () => {
    await addCapture({ code: 'G0010', bsc_output: 'test error', files: 'test.bsv' });
    const unresolved = await queryUnresolvedCaptures();
    assert.ok(unresolved.length > 0);
    const cap = unresolved[0];
    await resolveCaptureById(cap.id, { cause: 'test cause', solution: 'test fix' });
    const after = await queryUnresolvedCaptures();
    assert.ok(!after.some(c => c.id === cap.id));
  });
});
