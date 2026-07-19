/**
 * BSC 编译执行器（Q3 方向 2，子任务 2.2 + 2.3）
 *
 * 平台兼容策略：
 *   1. Native bsc: spawn bsc 子进程，支持 -verilog/-vdir/-bdir 等 flag
 *   2. Docker fallback: 当 native bsc 不可用时，用 docker run
 *      ghcr.io/alexforencich/bsc:latest bsc ... 跑编译（子任务 2.3）
 *
 * 约束：
 *   - 超时控制 120s，错误输出只取最后 200 行 + 前 20 行（防止超大日志撑爆 context）
 *   - specmate 不解析 bsc 输出格式（那是 diagnose 的事），只负责调用和传递结果
 */

import { spawn } from 'child_process';
import { platform } from 'os';
import { resolve, dirname } from 'path';
import { detectBSC } from './bsc-detector.mjs';
import { getCurrentSessionPhase } from '../db/query.mjs';

/** Maximum compilation timeout in milliseconds */
export const COMPILE_TIMEOUT = 120000; // 120s

/** Maximum output lines to capture (last N + first N) */
const OUTPUT_TAIL_LINES = 200;
const OUTPUT_HEAD_LINES = 20;

/**
 * Build bsc command line arguments from options
 * @param {object} opts
 * @param {string[]} opts.files - .bsv source files
 * @param {string} [opts.topModule] - top-level module name (default: derived from first file)
 * @param {string} [opts.vdir] - verilog output directory
 * @param {string} [opts.bdir] - intermediate build directory
 * @param {string[]} [opts.flags] - extra bsc flags (e.g. ['-verilog', '-keep-fires'])
 * @returns {string[]}
 */
function buildBSCArgs({ files, topModule, vdir = '.', bdir = '.', flags = [] }) {
    const args = [];
    // Default to Verilog generation
    const hasVerilogFlag = flags.some(f => f === '-verilog' || f === '-sim' || f === '-systemc' || f === '-e');
    if (!hasVerilogFlag) {
        args.push('-verilog');
    }
    if (vdir !== '.') args.push('-vdir', vdir);
    if (bdir !== '.') args.push('-bdir', bdir);

    // Add user-specified flags
    for (const f of flags) {
        if (f !== '-vdir' && f !== '-bdir') {
            args.push(f);
        }
    }

    // Top module
    if (topModule) {
        args.push('-g', topModule);
    }

    // Source files come last
    for (const f of files) {
        args.push(f);
    }

    return args;
}

/**
 * Parse process signal from exit reason
 * @param {string} signal
 * @returns {string}
 */
function parseSignal(signal) {
    if (!signal) return '';
    const sigMap = { SIGTERM: 'SIGTERM', SIGKILL: 'SIGKILL', SIGABRT: 'SIGABRT' };
    return sigMap[signal] || signal;
}

/**
 * Run bsc compilation and return stdout + stderr
 *
 * @param {object} opts
 * @param {string[]} opts.files - .bsv source files (absolute paths)
 * @param {string} [opts.topModule]
 * @param {string} [opts.vdir]
 * @param {string} [opts.bdir]
 * @param {string[]} [opts.flags]
 * @param {number} [opts.timeout] - override default 120s timeout
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, combined: string, exitCode: number|null, signal: string, timedOut: boolean, bscType: string, bscPath: string, args: string[]}>}
 */
export async function runBSC(opts = {}) {
    const { files = [], flags = [], timeout = COMPILE_TIMEOUT } = opts;

    // Detect bsc availability
    const bscInfo = detectBSC();
    if (bscInfo.type === 'unavailable') {
        return {
            success: false,
            stdout: '',
            stderr: '',
            combined: '⚠ 编译不可用：未检测到 bsc 且 Docker 未运行。specmate 仅执行静态检查。\n',
            exitCode: null,
            signal: '',
            timedOut: false,
            bscType: 'unavailable',
            bscPath: '',
            args: [],
        };
    }

    const args = buildBSCArgs(opts);

    // ── Phase-aware bdir strategy ──
    // In design phase, use a temp bdir to avoid cluttering the workspace.
    // In code/debug phase, use the default bdir so Agent sees incremental results.
    let effectiveBdir = opts.bdir;
    if (!effectiveBdir) {
        try {
            const phase = await getCurrentSessionPhase();
            if (phase === 'design') {
                effectiveBdir = resolve(process.cwd(), '.specmate-build');
            }
        } catch (_) { /* default bdir is fine */ }
    }

    // Build the command
    let cmd, cmdArgs, cwd;
    const cwd_ = process.cwd();

    if (bscInfo.type === 'native') {
        cmd = bscInfo.path;
        cmdArgs = args;
        cwd = cwd_;
    } else if (bscInfo.type === 'docker') {
        // Docker fallback (子任务 2.3)
        const workdir = '/workspace';
        const resolvedFiles = files.map(f => resolve(f).replace(/\\/g, '/'));
        // Normalize file paths for identity-safe comparison
        const normalizedFiles = files.map(f => resolve(f));

        cmd = 'docker';
        cmdArgs = [
            'run', '--rm',
            '-v', `${cwd_.replace(/\\/g, '/')}:${workdir}`,
            '-w', workdir,
            'ghcr.io/alexforencich/bsc:latest',
            'bsc',
            ...args.map(a => {
                // Translate file paths for Docker (use resolve() for safe comparison)
                if (normalizedFiles.includes(resolve(a))) {
                    const idx = normalizedFiles.indexOf(resolve(a));
                    return workdir + '/' + resolvedFiles[idx].replace(/^[A-Za-z]:/, '').replace(/\\/g, '/').replace(/^\//, '');
                }
                return a;
            }),
        ];
        cwd = cwd_;
    } else {
        return {
            success: false,
            stdout: '',
            stderr: '',
            combined: '⚠ 编译不可用：未检测到 bsc\n',
            exitCode: null,
            signal: '',
            timedOut: false,
            bscType: 'unavailable',
            bscPath: '',
            args: [],
        };
    }

    return new Promise((resolve_) => {
        const proc = spawn(cmd, cmdArgs, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: platform() === 'win32',
            timeout,
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let killed = false;

        const timer = setTimeout(() => {
            timedOut = true;
            if (!killed) {
                killed = true;
                proc.kill('SIGTERM');
                // Force kill after 5 more seconds
                setTimeout(() => {
                    try { proc.kill('SIGKILL'); } catch (_) {}
                }, 5000);
            }
        }, timeout);

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (exitCode, signal) => {
            clearTimeout(timer);

            // Combine stdout + stderr (bsc writes errors to stdout)
            // Trim output: last OUTPUT_TAIL_LINES + first OUTPUT_HEAD_LINES
            const combined = stdout + stderr;
            const lines = combined.split('\n');
            let trimmed = '';
            if (lines.length > OUTPUT_TAIL_LINES + OUTPUT_HEAD_LINES) {
                const head = lines.slice(0, OUTPUT_HEAD_LINES).join('\n');
                const tail = lines.slice(-OUTPUT_TAIL_LINES).join('\n');
                trimmed = `${head}\n\n... [截断 ${lines.length - OUTPUT_HEAD_LINES - OUTPUT_TAIL_LINES} 行] ...\n\n${tail}`;
            } else {
                trimmed = combined;
            }

            resolve_({
                success: exitCode === 0 && !timedOut && signal === null,
                stdout: stdout,
                stderr: stderr,
                combined: trimmed,
                exitCode,
                signal: parseSignal(signal),
                timedOut,
                bscType: bscInfo.type,
                bscPath: bscInfo.path,
                args: args,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve_({
                success: false,
                stdout,
                stderr,
                combined: `⚠ 编译进程启动失败: ${err.message}\n${stdout}${stderr}`.trim(),
                exitCode: null,
                signal: '',
                timedOut: false,
                bscType: bscInfo.type,
                bscPath: bscInfo.path,
                args,
            });
        });
    });
}
