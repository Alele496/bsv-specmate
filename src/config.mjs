import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(__dirname, '..');
export const PKG_DOCS = join(PKG_ROOT, 'docs');
export const PKG_EXAMPLES = join(PKG_ROOT, 'examples');
export const PKG_DATA = join(PKG_ROOT, 'data');

export function getDataRoot() {
    return process.env.SPECMATE_DATA || join(homedir(), '.specmate');
}

export function getDBPath() {
    return join(getDataRoot(), 'data', 'knowledge.db');
}

export function getUserErrorsDir() {
    return join(getDataRoot(), 'docs', 'errors');
}

export function initDataDir(force = false) {
    const root = getDataRoot();
    const dataDir = join(root, 'data');
    const errorsDir = getUserErrorsDir();

    if (!existsSync(root)) {
        mkdirSync(root, { recursive: true });
        mkdirSync(dataDir, { recursive: true });
        mkdirSync(errorsDir, { recursive: true });

        if (existsSync(join(PKG_DATA, 'knowledge.db'))) {
            copyFileSync(join(PKG_DATA, 'knowledge.db'), join(dataDir, 'knowledge.db'));
        }

        const pkgErrors = join(PKG_DOCS, 'errors');
        if (existsSync(pkgErrors)) {
            for (const f of readdirSync(pkgErrors)) {
                if (f.endsWith('.md')) {
                    copyFileSync(join(pkgErrors, f), join(errorsDir, f));
                }
            }
        }

        return { created: true, root };
    }

    if (force) {
        if (!existsSync(join(dataDir, 'knowledge.db')) ||
            !existsSync(join(PKG_DATA, 'knowledge.db'))) {
            return { created: false, root };
        }
        copyFileSync(join(PKG_DATA, 'knowledge.db'), join(dataDir, 'knowledge.db'));
        return { reloaded: true, root };
    }

    if (!existsSync(join(dataDir, 'knowledge.db'))) {
        mkdirSync(dataDir, { recursive: true });
        if (existsSync(join(PKG_DATA, 'knowledge.db'))) {
            copyFileSync(join(PKG_DATA, 'knowledge.db'), join(dataDir, 'knowledge.db'));
        }
    }

    return { created: false, root };
}

const LEVELS = ['silicon', 'wafer', 'tapeout', 'verify', 'develop'];
const ALIASES = { silicon: 'verify', wafer: 'develop' };

export function getLevel() {
    const raw = (process.env.SPECMATE_LEVEL || 'develop').toLowerCase();
    if (ALIASES[raw]) return ALIASES[raw];
    return LEVELS.includes(raw) ? raw : 'develop';
}

export const LEVEL_LIMITS = {
    // verify — 验证模式：快速迭代，别挡路
    verify: {
        errors: 3, highlight: 'TOP 3',
        name: '验证模式',
        desc: '快速迭代跑通逻辑，只应答不主动',
        mode: 'passive',
        intro: true,
        crossRef: false,
        styleHint: false,
        collabHint: false,
        // 推送：全关 — Agent 问才答
        pushPreCode: false,
        pushCheckStyle: false,
        pushOnError: false,
        pushDiff: false,
        pushAnalyze: false,
    },
    // develop — 开发模式：写新模块，编码前提醒陷阱（默认）
    develop: {
        errors: 5, highlight: 'TOP 5',
        name: '开发模式',
        desc: '编码前提醒陷阱，该提醒的提醒',
        mode: 'suggestive',
        intro: true,
        crossRef: true,
        styleHint: false,
        collabHint: false,
        // 推送：编码前推陷阱
        pushPreCode: true,
        pushCheckStyle: false,
        pushOnError: false,
        pushDiff: false,
        pushAnalyze: false,
    },
    // tapeout — 流片模式：要交出去了，全量检查
    tapeout: {
        errors: 10, highlight: 'TOP 10',
        name: '流片模式',
        desc: '要交出去了，一个都别漏',
        mode: 'collaborative',
        intro: true,
        crossRef: true,
        styleHint: true,
        collabHint: true,
        scanSimilar: true,
        // 推送：全开 — 全程守护
        pushPreCode: true,
        pushCheckStyle: true,
        pushOnError: true,
        pushDiff: true,
        pushAnalyze: true,
    },
};
