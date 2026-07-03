import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { PKG_EXAMPLES } from '../config.mjs';

const BSV_DIR = resolve(PKG_EXAMPLES, 'bsv');
const MAX_FILES = 5;
const MAX_LINES = 40;

export function lookupExample(args) {
    const keyword = (args.keyword || '').trim();
    const directory = (args.directory || '').trim();

    if (!keyword) {
        return '用法: lookup_example keyword="<关键词>" [directory="bsc.scheduler"]\n' +
            `可选 directory 限定搜索范围（如 bsc.scheduler, bsc.arrays, bsc.typechecker）`;
    }

    const searchDir = directory
        ? resolve(BSV_DIR, directory)
        : BSV_DIR;

    if (!existsSync(searchDir)) {
        return `目录 "${directory}" 不存在。examples/bsv/ 下可用目录请直接查看 examples/bsv/。`;
    }

    const files = collectBSVFiles(searchDir, 2000);
    const results = [];
    const kws = keyword.toLowerCase().split(/\s+/);

    for (const file of files) {
        if (results.length >= MAX_FILES) break;

        try {
            const content = readFileSync(file, 'utf-8');
            const contentLower = content.toLowerCase();

            if (kws.every(kw => contentLower.includes(kw))) {
                const lines = content.split('\n');
                const snippets = [];

                for (let i = 0; i < lines.length; i++) {
                    const lineLower = lines[i].toLowerCase();
                    if (kws.some(kw => lineLower.includes(kw))) {
                        const start = Math.max(0, i - 3);
                        const end = Math.min(lines.length, i + 7);
                        for (let j = start; j < end; j++) {
                            snippets.push(`${j + 1}: ${lines[j]}`);
                        }
                        snippets.push('---');
                    }
                }

                const uniqueSnippets = [...new Set(snippets.join('\n').split('\n'))].join('\n');
                const relPath = file.replace(BSV_DIR, '').replace(/\\/g, '/').replace(/^\//, '');

                results.push({
                    file: relPath,
                    content: uniqueSnippets.substring(0, MAX_LINES * 80) // limit snippet size
                });
            }
        } catch {
            // skip unreadable files
        }
    }

    if (results.length === 0) {
        return `未在 "${directory || '全部'}" 中找到匹配 "${keyword}" 的示例。尝试缩短关键词或扩大搜索范围。`;
    }

    return results.map(r =>
        `### ${r.file}\n\`\`\`bsv\n${r.content}\n\`\`\``
    ).join('\n\n');
}

function collectBSVFiles(dir, max) {
    const files = [];
    if (!existsSync(dir)) return files;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (files.length >= max) break;
        const full = resolve(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
            files.push(...collectBSVFiles(full, max - files.length));
        } else if (entry.isFile() && entry.name.endsWith('.bsv')) {
            files.push(full);
        }
    }
    return files;
}
