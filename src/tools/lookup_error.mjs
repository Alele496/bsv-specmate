import { queryError, queryAllErrors, querySearch, hitError } from '../db/query.mjs';
import { getLevel } from '../config.mjs';

export async function lookupError(args) {
    const code = args.code?.trim();
    const level = getLevel();

    if (!code) {
        const all = await queryAllErrors();
        return JSON.stringify(all, null, 2);
    }

    const err = await queryError(code);

    if (!err) {
        const candidates = await querySearch(code);
        if (candidates.length > 0) {
            return `错误码 "${code}" 未找到。相近条目：\n` +
                candidates.map(c => `  ${c.code}: ${c.title}`).join('\n');
        }
        return `错误码 "${code}" 未找到。可用 lookup_error (无参数) 查看全部错误索引。`;
    }

    return formatError(err, level);
}

function formatError(err, level) {
    if (level === 'silicon') {
        return [
            `## ${err.code} — ${err.title} (×${err.count})`,
            '',
            '> ' + (err.rules || err.cause?.substring(0, 200) || ''),
            '',
            `💡 设置 SPECMATE_LEVEL=wafer 或 tapeout 查看更多详情`,
        ].join('\n');
    }

    return [
        `## ${err.code} — ${err.title} (×${err.count})`,
        '',
        '### 现象 (bsc 输出)',
        err.phenomena || '(未记录)',
        '',
        '### 原因',
        err.cause || '(未记录)',
        '',
        '### 解决方案',
        err.solution || '(未记录)',
        err.rules ? `\n> **规则**: ${err.rules}` : '',
    ].join('\n');
}

export async function hitAndLookup(code) {
    await hitError(code);
    return await lookupError({ code });
}
