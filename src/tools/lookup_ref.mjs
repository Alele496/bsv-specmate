import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { PKG_DOCS } from '../config.mjs';

const REF_DIR = resolve(PKG_DOCS, 'reference');

export const VALID_TOPICS = ['module', 'types', 'syntax', 'stdlib', 'keywords', 'schedule', 'patterns', 'styles', 'tutorial', 'examples'];

export function lookupRef(args) {
    const topic = (args.topic || '').toLowerCase().trim();

    if (!topic || !VALID_TOPICS.includes(topic)) {
        return `用法: lookup_ref topic="<topic>"\n可用 topic: ${VALID_TOPICS.join(', ')}`;
    }

    const filePath = resolve(REF_DIR, `${topic}.md`);
    if (!existsSync(filePath)) {
        return `Reference "${topic}" 不存在。`;
    }

    const content = readFileSync(filePath, 'utf-8');
    return content;
}

export function listRefTopics() {
    return `可用参考主题:\n` +
        VALID_TOPICS.map(t => `  ${t} — docs/reference/${t}.md`).join('\n');
}
