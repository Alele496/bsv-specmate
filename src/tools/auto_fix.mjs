/**
 * auto_fix.mjs — automatic source-code fixes for specmate-detected issues.
 *
 * Each function targets a specific error code and returns:
 *   { fixed: boolean, newSource: string, changes: string[] }
 *
 * Caller is responsible for reading/writing files and recompiling.
 */

/**
 * autoFixP0200 — expand BVI schedule group syntax into pair-wise declarations.
 *
 * BSC does NOT support grouped schedule like:
 *   schedule rx_data CF (a, b, c);
 *
 * This must be expanded to:
 *   schedule rx_data CF a;
 *   schedule rx_data CF b;
 *   schedule rx_data CF c;
 *
 * @param {string} source - full .bsv source code
 * @returns {{ fixed: boolean, newSource: string, changes: string[] }}
 */
export function autoFixP0200(source) {
    const changes = [];
    let fixed = false;

    // Match schedule declarations with parenthesized method list:
    //   schedule methodName CF (methodA, methodB, ...)
    // Only inside BVI import blocks: import "BVI" ... endmodule
    const bviBlockRe = /import\s+"BVI"[\s\S]*?endmodule/g;
    let newSource = source;

    let blockMatch;
    while ((blockMatch = bviBlockRe.exec(source)) !== null) {
        const block = blockMatch[0];
        const schedRe = /schedule\s+(\w+)\s+(CF|SB|SBR|C)\s*\(([^)]+)\)/g;
        let schedMatch;
        let blockModified = false;
        let newBlock = block;

        while ((schedMatch = schedRe.exec(block)) !== null) {
            const methodName = schedMatch[1];
            const schedType = schedMatch[2];
            const methodsStr = schedMatch[3];
            const methods = methodsStr.split(',').map(s => s.trim()).filter(Boolean);

            if (methods.length >= 2) {
                const pairDecls = methods.map(m => `schedule ${methodName} ${schedType} ${m};`).join('\n');
                const original = schedMatch[0];

                // Only replace first occurrence (re.exec loop handles each match)
                newBlock = newBlock.replace(original, pairDecls);
                blockModified = true;
                changes.push(
                    `P0200: 展开 schedule ${methodName} ${schedType} (${methods.join(', ')}) → ${methods.length} 条逐对声明`
                );
            }
        }

        if (blockModified) {
            newSource = newSource.replace(block, newBlock);
            fixed = true;
        }
    }

    return { fixed, newSource, changes };
}
