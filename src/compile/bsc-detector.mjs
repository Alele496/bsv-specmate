/**
 * BSC 可用性检测模块（Q3 方向 2，子任务 2.1）
 *
 * 检测策略（按优先级）：
 *   1. Native: 检测 bsc 是否在 PATH 中（which/where bsc）
 *   2. Docker: 检测 docker daemon 是否运行，是否有 bsc 镜像可用
 *   3. Unavailable: 两者都不可用
 *
 * 结果缓存：首次检测后缓存结果，避免重复执行 which/docker 命令。
 */

import { execSync } from 'child_process';
import { platform } from 'os';

/** @type {{ type: 'native'|'docker'|'unavailable', path: string, version?: string }|null} */
let _cached = null;

/**
 * 检测 bsc 编译器的可用性
 * @returns {{ type: 'native'|'docker'|'unavailable', path: string, version?: string }}
 */
export function detectBSC() {
    if (_cached) return _cached;

    const isWindows = platform() === 'win32';

    // Strategy 1: Check native bsc
    try {
        const cmd = isWindows ? 'where bsc' : 'which bsc';
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();

        if (output) {
            const bscPath = output.split('\n')[0].trim();
            // Verify by getting version
            let version = null;
            try {
                const verOutput = execSync(`"${bscPath}" -version`, { encoding: 'utf-8', timeout: 5000 }).trim();
                version = verOutput;
            } catch (_) { /* version check non-critical */ }

            _cached = { type: 'native', path: bscPath, version };
            return _cached;
        }
    } catch (_) { /* bsc not in PATH */ }

    // Strategy 2: Check Docker availability + bsc image
    try {
        const dockerRunning = isWindows
            ? execSync('docker info', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' })
            : execSync('docker info', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });

        // Check if bsc image is available
        const imageCheck = execSync(
            'docker images --format "{{.Repository}}:{{.Tag}}" ghcr.io/alexforencich/bsc 2>nul',
            { encoding: 'utf-8', timeout: 5000, stdio: 'pipe', shell: true }
        ).trim();

        const dockerPath = isWindows ? 'docker' : 'docker';

        if (imageCheck) {
            _cached = { type: 'docker', path: dockerPath, version: 'ghcr.io/alexforencich/bsc:latest' };
        } else {
            // Image not cached locally, but Docker is running — pull attempt
            _cached = { type: 'docker', path: dockerPath, version: 'ghcr.io/alexforencich/bsc:latest (will pull)' };
        }
        return _cached;
    } catch (_) { /* Docker not available */ }

    // Strategy 3: Unavailable
    _cached = { type: 'unavailable', path: '' };
    return _cached;
}

/**
 * 重置缓存（用于测试或环境变化后重新检测）
 */
export function resetBSCDetection() {
    _cached = null;
}
