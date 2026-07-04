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

const LEVELS = ['silicon', 'wafer', 'tapeout'];

export function getLevel() {
    const raw = (process.env.SPECMATE_LEVEL || 'wafer').toLowerCase();
    return LEVELS.includes(raw) ? raw : 'wafer';
}

export const LEVEL_LIMITS = {
    silicon: {
        errors: 3, highlight: 'TOP 3',
        name: '静默模式',
        mode: 'passive',   // 首次告知工具存在，之后纯应答
        intro: true,        // 展示极简工具列表
        crossRef: false,    // 不追加交叉引用
        styleHint: false,   // 不推荐风格
        collabHint: false,  // 不建立协作关系
    },
    wafer: {
        errors: 5, highlight: 'TOP 5',
        name: '引导模式',
        mode: 'suggestive', // 每次返回末尾带交叉引用
        intro: true,
        crossRef: true,
        styleHint: false,
        collabHint: false,
    },
    tapeout: {
        errors: 10, highlight: 'TOP 10',
        name: '全程协作',
        mode: 'collaborative', // 启动建立搭档 + 编码引导 + 持续反馈
        intro: true,
        crossRef: true,
        styleHint: true,     // 主动推荐编码风格
        collabHint: true,    // 建立"搭档"关系
        scanSimilar: true,   // lookup_error 后扫描相似模式
    },
};
