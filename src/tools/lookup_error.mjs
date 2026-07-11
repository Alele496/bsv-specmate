import { queryError, queryAllErrors, querySearch, hitError } from '../db/query.mjs';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';

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
    const cfg = LEVEL_LIMITS[level];
    if (LEVEL_LIMITS[level].mode === 'passive') {
        return [
            `## ${err.code} — ${err.title} (×${err.count})`,
            '',
            '> ' + (err.rules || err.cause?.substring(0, 200) || ''),
            '',
            `💡 设置 SPECMATE_LEVEL=develop 或 tapeout 查看更多详情`,
        ].join('\n');
    }

    const base = [
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
        crossRef(err.code),
    ];

    if (cfg.scanSimilar) {
        base.push('');
        base.push('💬 我扫了一下——你的代码中可能存在类似模式。');
        base.push(`建议对相关文件执行 check_style 检查，或 describe suggest(context="${err.code} 类似问题") 让我帮你定位。`);
    }

    return base.join('\n');
}

function crossRef(code) {
    const map = {
        P0005: 'keywords', P0030: 'module', P0032: 'module',
        T0060: 'types', T0061: 'types', T0051: 'types',
        G0004: 'schedule', G0010: 'schedule',
        T0004: 'stdlib', T0011: 'keywords',
    };
    const topic = map[code];
    return topic ? `\n\n💡 相关: \`lookup_ref(topic="${topic}")\` 查看对应规范文档。` : '';
}

export async function hitAndLookup(code) {
    await hitError(code);
    return await lookupError({ code });
}
