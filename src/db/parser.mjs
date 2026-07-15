import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { PKG_DOCS, getUserErrorsDir } from '../config.mjs';

const PKG_ERRORS_DIR = join(PKG_DOCS, 'errors');

/**
 * Collect all .md error files from package + user dirs.
 * User files override package files of the same name (last wins).
 * @returns {string[]} absolute file paths
 */
export function collectErrorFiles() {
    const files = {};
    const addDir = (dir) => {
        if (!existsSync(dir)) return;
        for (const f of readdirSync(dir)) {
            if (f.endsWith('.md') && f !== 'INDEX.md') {
                files[f] = join(dir, f);
            }
        }
    };
    addDir(PKG_ERRORS_DIR);
    addDir(getUserErrorsDir());
    return Object.values(files);
}

/**
 * Parse a single Markdown error file into a structured error object.
 * @param {string} content - raw Markdown content
 * @returns {{ code: string, title: string, keywords: string, phenomena: string, cause: string, solution: string, rules: string, count: number }}
 */
export function parseErrorFile(content) {
    const lines = content.split('\n');

    let code = '';
    let title = '';
    let keywords = '';
    let phenomena = '';
    let cause = '';
    let solution = '';
    let rules = '';
    let count = 1;

    const firstLine = lines[0] || '';
    const match = firstLine.match(/^#\s+(\S+)\s*[—-]\s*(.+?)\s*(?:\(×(\d+)\))?$/);
    if (match) {
        code = match[1].trim();
        title = match[2].trim();
        if (match[3]) count = parseInt(match[3], 10);
    }

    let section = '';
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // 支持粗体格式 ( **现象** / **bsc 输出** ) 和 Markdown 标题格式 ( ## 现象 / ## bsc 输出 )
        if (/^\*\*(?:bsc\s*输出|现象)\*\*/.test(line) || /^##\s+(?:现象|bsc\s*输出)/.test(line)) {
            section = 'phenomena';
            continue;
        }
        if (/^\*\*原因\*\*/.test(line) || /^##\s+原因\b/.test(line)) {
            section = 'cause';
            continue;
        }
        // 粗体: **解决** | 标题: ## 解决 或 ## 解决方案
        if (/^\*\*解决\*\*/.test(line) || /^##\s+解决/.test(line)) {
            section = 'solution';
            continue;
        }
        // 标题格式的 ## 规则（粗体格式的 > **规则**: 在下方的 inline 检测中处理）
        if (/^##\s+规则\b/.test(line)) {
            section = 'rules';
            continue;
        }
        if (line.startsWith('> **规则**:')) {
            rules += line.replace(/^>\s*\*\*规则\*\*:\s*/, '').trim();
            rules += '\n';
            continue;
        }
        if (line.startsWith('> ') && section === 'rules') {
            rules += line.replace(/^>\s*/, '');
            continue;
        }

        if (section === 'phenomena') {
            phenomena += line + '\n';
        } else if (section === 'cause') {
            if (!line.startsWith('#') && line.trim()) {
                cause += line + '\n';
            }
        } else if (section === 'solution') {
            if (!line.startsWith('#') && !line.startsWith('> **规则')) {
                solution += line + '\n';
            }
        }
    }

    phenomena = phenomena.trim();
    cause = cause.trim();
    solution = solution.trim();
    rules = rules.trim();
    keywords = [code, title].filter(Boolean).join(' ');

    return { code, title, keywords, phenomena, cause, solution, rules, count };
}
