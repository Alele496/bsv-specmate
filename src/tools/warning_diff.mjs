/**
 * BSC 编译 warning 增量分析。
 */

/**
 * diffWarnings(prev, curr) → { added, removed, persistent }
 * 每个 warning 格式: { file, line, code, message }
 */
export function diffWarnings(prevWarnings, currWarnings) {
    // 用 `${file}:${line}:${code}` 作为唯一键
    const key = w => `${w.file}:${w.line}:${w.code}`;
    const prevKeys = new Set(prevWarnings.map(key));
    const currKeys = new Set(currWarnings.map(key));

    return {
        added: currWarnings.filter(w => !prevKeys.has(key(w))),
        removed: prevWarnings.filter(w => !currKeys.has(key(w))),
        persistent: currWarnings.filter(w => prevKeys.has(key(w))),
    };
}

/**
 * 解析 BSC 标准错误/warning 输出格式。
 *
 * BSC 格式:
 * Warning: "File.bsv", line 42, column 10: (G0010)
 *   "message text"
 *
 * 返回 parsed[] 或空数组
 */
export function parseBSCWarnings(bscOutput) {
    const warnings = [];

    // Pattern matches both Warning and Error lines with their codes
    // Format: Warning: "File.bsv", line 42, column 10: (G0010)
    //          "message text"
    const re = /(Warning|Error):\s*"([^"]+)",\s*line\s*(\d+)[^)]*\((\w+)\)\s*\n\s*"([^"]+)"/gs;

    let m;
    while ((m = re.exec(bscOutput)) !== null) {
        warnings.push({
            file: m[2],
            line: parseInt(m[3], 10),
            code: m[4],
            message: m[5],
        });
    }

    return warnings;
}
