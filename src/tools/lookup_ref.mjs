import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REF_DIR = resolve(PROJECT_ROOT, 'docs', 'reference');

const VALID_TOPICS = ['module', 'types', 'syntax', 'examples'];

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
