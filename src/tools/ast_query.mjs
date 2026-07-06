/**
 * AST query module for BSV source files.
 *
 * Uses tree-sitter + tree-sitter-bsv to parse .bsv files and answer
 * structural questions: call graphs, dependency analysis, scheduling
 * conflict detection, module/rule/method extraction.
 *
 * ## Actual tree-sitter-bsv node types (from generated parser)
 *
 * source_file      - root
 * package_def      - package definition
 * package_item     - top-level item in package
 * moduleDef        - module definition
 * moduleStmt       - wrapper around each statement in module
 * ruledef          - rule definition
 * methodimpl       - method implementation
 * moduleinst       - submodule instantiation (x <- mkY())
 * moduleinstRHS    - right-hand side of moduleinst
 * nb_assignment    - non-blocking assignment (<=)
 * functioncall     - function/method call expression
 * functioncall_stmt- function call as a statement
 * actiondef        - Action method declaration in interface
 * methoddef        - value method declaration in interface
 * interface        - interface declaration
 * variable         - variable reference (lValue)
 * identifier       - wrapped identifier node
 * lcIdentifier     - lowercase identifier leaf
 * ucIdentifier     - uppercase identifier leaf
 * type_any         - type reference
 * type             - type with parameters
 * typeParam        - type parameter #(...)
 * stmt             - statement wrapper
 * assignrhs        - right-hand side of assignment expression
 * varrhs           - right-hand side value
 */

import { readFileSync, existsSync } from 'fs';
import Parser from 'tree-sitter';
import BSV from 'tree-sitter-bsv';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let _parser = null;
function getParser() {
    if (!_parser) {
        _parser = new Parser();
        _parser.setLanguage(BSV);
    }
    return _parser;
}

/** Get source text for a node. */
function textOf(node, source) {
    return source.substring(node.startIndex, node.endIndex);
}

/** Walk all named children recursively. Calls visitor(node). Return true to stop. */
function walk(node, visitor) {
    if (visitor(node)) return true;
    for (const child of node.namedChildren) {
        if (walk(child, visitor)) return true;
    }
    return false;
}

/** Collect all named descendants matching any of `types`. */
function collectAll(node, types) {
    const set = new Set(types);
    const results = [];
    walk(node, (n) => {
        if (set.has(n.type)) results.push(n);
        return false;
    });
    return results;
}

/** Find first ancestor whose type is in `types`. */
function findAncestor(node, types) {
    const set = new Set(types);
    let cur = node.parent;
    while (cur) {
        if (set.has(cur.type)) return cur;
        cur = cur.parent;
    }
    return null;
}

/** Resolve an identifier leaf node's text. */
function identText(node, source) {
    if (!node) return null;
    if (node.type === 'lcIdentifier' || node.type === 'ucIdentifier') {
        return textOf(node, source);
    }
    for (const child of node.children) {
        if (child.type === 'lcIdentifier' || child.type === 'ucIdentifier') {
            return textOf(child, source);
        }
    }
    return null;
}

/** Return text from first direct named child of given type(s). */
function firstChildOfType(node, types, source) {
    const set = new Set(Array.isArray(types) ? types : [types]);
    for (const child of node.namedChildren) {
        if (set.has(child.type)) {
            const t = identText(child, source) || textOf(child, source);
            if (t) return t;
        }
    }
    return null;
}

/** Get the name from a moduleDef/ruledef: the first `variable` child. */
function nodeName(node, source) {
    return firstChildOfType(node, ['variable', 'lcIdentifier'], source) || 'unknown';
}

/** Get the enclosing module name for a node. */
function enclosingModuleName(node, source) {
    const mod = findAncestor(node, ['moduleDef']);
    if (!mod) return null;
    return nodeName(mod, source);
}

/** Get the enclosing rule name for a node. */
function enclosingRuleName(node, source) {
    const rule = findAncestor(node, ['ruledef']);
    if (!rule) return null;
    return nodeName(rule, source);
}

/** Format line:col (1-indexed) from a node. */
function fmtLine(node) {
    return node.startPosition.row + 1;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse a .bsv file. Returns { tree, source, file } or null.
 */
export function parseFile(filePath) {
    if (!existsSync(filePath)) return null;
    try {
        const source = readFileSync(filePath, 'utf-8');
        const parser = getParser();
        const tree = parser.parse(source);
        return { tree, source, file: filePath };
    } catch (_) {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Module extraction
// ---------------------------------------------------------------------------

/**
 * Extract all module definitions.
 * Returns [{ name, line }]
 */
export function extractModules(tree, source, file) {
    const modules = [];
    const modNodes = collectAll(tree.rootNode, ['moduleDef']);

    for (const mod of modNodes) {
        const name = nodeName(mod, source);
        modules.push({ name, line: fmtLine(mod), node: mod });
    }
    return modules;
}

// ---------------------------------------------------------------------------
// Rule extraction
// ---------------------------------------------------------------------------

/**
 * Extract all rules from source.
 * Returns [{ name, moduleName, line, body }]
 */
export function extractRules(tree, source, file) {
    const rules = [];
    const ruleNodes = collectAll(tree.rootNode, ['ruledef']);

    for (const rn of ruleNodes) {
        const name = nodeName(rn, source);
        const moduleName = enclosingModuleName(rn, source);
        const body = textOf(rn, source);

        rules.push({ name, moduleName, line: fmtLine(rn), body, node: rn });
    }
    return rules;
}

// ---------------------------------------------------------------------------
// Method extraction
// ---------------------------------------------------------------------------

/**
 * Extract all method implementations.
 * Returns [{ name, moduleName, line, isAction, isValue, body }]
 */
export function extractMethods(tree, source, file) {
    const methods = [];
    const methodNodes = collectAll(tree.rootNode, ['methodimpl']);

    for (const mn of methodNodes) {
        // methodimpl has: type_any? variable(name) impl_paramlist? stmt*
        // The method name is in the `variable` child, not type_any
        const name = firstChildOfType(mn, 'variable', source) || 'unknown';
        const moduleName = enclosingModuleName(mn, source);

        // Check if it's an Action method by looking for 'Action' in children
        let isAction = false;
        let isValue = false;
        for (const child of mn.namedChildren) {
            if (child.type === 'type_any') {
                const t = identText(child, source);
                if (t === 'Action' || t === 'ActionValue') isAction = true;
                if (t === 'ActionValue') isValue = true;
            }
        }

        const body = textOf(mn, source);

        methods.push({ name, moduleName, line: fmtLine(mn), isAction, isValue, body, node: mn });
    }
    return methods;
}

// ---------------------------------------------------------------------------
// Interface method declarations (in interface blocks)
// ---------------------------------------------------------------------------

/**
 * Extract method declarations from interface blocks.
 * Returns [{ name, isAction, line }]
 */
export function extractInterfaceMethods(tree, source, file) {
    const methods = [];
    const actionDefs = collectAll(tree.rootNode, ['actiondef']);
    const methodDefs = collectAll(tree.rootNode, ['methoddef']);

    for (const ad of actionDefs) {
        const name = firstChildOfType(ad, 'variable', source) || 'unknown';
        methods.push({ name, isAction: true, line: fmtLine(ad) });
    }
    for (const md of methodDefs) {
        const name = firstChildOfType(md, 'variable', source) || 'unknown';
        methods.push({ name, isAction: false, line: fmtLine(md) });
    }
    return methods;
}

// ---------------------------------------------------------------------------
// Submodule instance extraction
// ---------------------------------------------------------------------------

/**
 * Extract all submodule instantiations (x <- mkModule(...)).
 * Returns [{ name, moduleType, line, moduleName }]
 */
export function extractSubmoduleInstances(tree, source, file) {
    const instances = [];
    const instNodes = collectAll(tree.rootNode, ['moduleinst']);

    for (const inst of instNodes) {
        // moduleinst has: type (optional), lcIdentifier (name), moduleinstRHS (mkXxx())
        const rhs = inst.namedChildren.find(c => c.type === 'moduleinstRHS');
        const moduleType = rhs ? textOf(rhs, source) : 'unknown';
        // Name is in `lcIdentifier` child (or `variable`)
        const name = firstChildOfType(inst, ['lcIdentifier', 'variable'], source) || 'unknown';
        const moduleName = enclosingModuleName(inst, source);

        instances.push({ name, moduleType, line: fmtLine(inst), moduleName, node: inst });
    }
    return instances;
}

// ---------------------------------------------------------------------------
// Register declaration extraction
// ---------------------------------------------------------------------------

/**
 * Extract register declarations (Reg#(T) name <- ...) from submodule instances.
 * Returns [{ name, type, line, moduleName }]
 */
export function extractRegDeclarations(tree, source, file) {
    const regs = [];
    const instNodes = collectAll(tree.rootNode, ['moduleinst']);

    for (const inst of instNodes) {
        const typeNode = inst.namedChildren.find(c => c.type === 'type' || c.type === 'type_any');
        if (!typeNode) continue;
        const typeText = textOf(typeNode, source);
        const rhsNode = inst.namedChildren.find(c => c.type === 'moduleinstRHS');
        const rhsText = rhsNode ? textOf(rhsNode, source) : '';
        // Check if it's register storage: Reg, RegU, RegFile, Vector#(...Reg...)
        if (!/Reg/.test(typeText) && !/Reg/.test(rhsText)) continue;

        const name = firstChildOfType(inst, ['lcIdentifier', 'variable'], source) || 'unknown';
        const moduleName = enclosingModuleName(inst, source);

        regs.push({ name, type: typeText, line: fmtLine(inst), moduleName });
    }
    return regs;
}

// ---------------------------------------------------------------------------
// Method/function call extraction
// ---------------------------------------------------------------------------

/**
 * Extract all function/method calls (sub.write(), fn(), etc.).
 * Returns [{ text, line, ruleName, moduleName }]
 */
export function extractCalls(tree, source, file) {
    const calls = [];
    const callNodes = collectAll(tree.rootNode, ['functioncall']);

    for (const fc of callNodes) {
        const text = textOf(fc, source);
        const ruleName = enclosingRuleName(fc, source);
        const moduleName = enclosingModuleName(fc, source);

        // Parse target.method for method calls vs plain function calls
        const dotIdx = text.indexOf('.');
        const target = dotIdx !== -1 ? text.substring(0, dotIdx).trim() : null;
        const parenIdx = text.indexOf('(');
        const method = dotIdx !== -1
            ? (parenIdx !== -1 ? text.substring(dotIdx + 1, parenIdx).trim() : text.substring(dotIdx + 1).trim())
            : (parenIdx !== -1 ? text.substring(0, parenIdx).trim() : text.trim());

        calls.push({
            text,
            target,
            method,
            isMethodCall: dotIdx !== -1,
            line: fmtLine(fc),
            ruleName,
            moduleName,
        });
    }
    return calls;
}

// ---------------------------------------------------------------------------
// Register write extraction (nb_assignment)
// ---------------------------------------------------------------------------

/**
 * Extract non-blocking assignments (reg <= value).
 * Returns [{ reg, value, line, ruleName, moduleName }]
 */
export function extractRegWrites(tree, source, file) {
    const writes = [];
    const nbNodes = collectAll(tree.rootNode, ['nb_assignment']);

    for (const nb of nbNodes) {
        const text = textOf(nb, source);
        const arrowIdx = text.indexOf('<=');
        if (arrowIdx === -1) continue;
        const reg = text.substring(0, arrowIdx).trim();
        const value = text.substring(arrowIdx + 2).trim();

        const ruleName = enclosingRuleName(nb, source);
        const moduleName = enclosingModuleName(nb, source);

        writes.push({ reg, value, line: fmtLine(nb), ruleName, moduleName });
    }
    return writes;
}

// ---------------------------------------------------------------------------
// Function definition extraction
// ---------------------------------------------------------------------------

/**
 * Extract function definitions.
 * Returns [{ name, line, moduleName }]
 */
export function extractFunctionDefs(tree, source, file) {
    const funcs = [];
    // function definitions appear as 'function' keyword nodes
    walk(tree.rootNode, (node) => {
        if (node.type === 'function') {
            const fname = firstChildOfType(node.parent || node, ['variable', 'lcIdentifier'], source) || 'function';
            funcs.push({
                name: fname,
                line: fmtLine(node),
                moduleName: enclosingModuleName(node, source),
            });
        }
        return false;
    });
    return funcs;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Find registers written multiple times within a single rule.
 * Returns [{ rule, moduleName, reg, lines }]
 */
export function findConflictPairs(tree, source, file) {
    const conflicts = [];
    const ruleNodes = collectAll(tree.rootNode, ['ruledef']);

    for (const rn of ruleNodes) {
        const ruleName = nodeName(rn, source);
        const moduleName = enclosingModuleName(rn, source);
        const writes = {};

        const nbNodes = collectAll(rn, ['nb_assignment']);
        for (const nb of nbNodes) {
            const text = textOf(nb, source);
            const arrowIdx = text.indexOf('<=');
            if (arrowIdx === -1) continue;
            const reg = text.substring(0, arrowIdx).trim();

            if (!writes[reg]) writes[reg] = [];
            writes[reg].push(fmtLine(nb));
        }

        for (const [reg, lines] of Object.entries(writes)) {
            if (lines.length > 1) {
                conflicts.push({ rule: ruleName, moduleName, reg, lines });
            }
        }
    }
    return conflicts;
}

// ---------------------------------------------------------------------------
// Cross-file analysis
// ---------------------------------------------------------------------------

/**
 * Build a module instantiation + method call graph across files.
 * Returns { nodes: string[], edges: {from, to, type, file, line}[] }
 */
export function buildCallGraph(filePaths) {
    const nodes = new Set();
    const edges = [];

    for (const fp of filePaths) {
        const parsed = parseFile(fp);
        if (!parsed) continue;
        const { tree, source } = parsed;

        for (const m of extractModules(tree, source, fp)) {
            nodes.add(m.name);
        }

        for (const inst of extractSubmoduleInstances(tree, source, fp)) {
            nodes.add(inst.moduleType);
            edges.push({
                from: inst.moduleName || 'unknown',
                to: inst.moduleType,
                type: 'instantiates',
                file: fp,
                line: inst.line,
            });
        }

        for (const call of extractCalls(tree, source, fp)) {
            if (call.isMethodCall) {
                edges.push({
                    from: call.ruleName || call.moduleName || 'unknown',
                    to: `${call.target}.${call.method}`,
                    type: 'calls',
                    file: fp,
                    line: call.line,
                });
            }
        }
    }

    return { nodes: [...nodes], edges };
}

/**
 * Build a module dependency graph.
 * Returns { modules: {name, file}[], deps: {from, to, file, via}[] }
 */
export function buildDependencyGraph(filePaths) {
    const modules = [];
    const deps = [];

    for (const fp of filePaths) {
        const parsed = parseFile(fp);
        if (!parsed) continue;
        const { tree, source } = parsed;

        for (const m of extractModules(tree, source, fp)) {
            modules.push({ name: m.name, file: fp, line: m.line });
        }

        for (const inst of extractSubmoduleInstances(tree, source, fp)) {
            deps.push({
                from: inst.moduleName || 'unknown',
                to: inst.moduleType,
                file: fp,
                via: inst.name,
            });
        }
    }

    return { modules, deps };
}

// ---------------------------------------------------------------------------
// Position query
// ---------------------------------------------------------------------------

/**
 * Find the AST node at line/col (1-indexed).
 * Returns { type, text, line, col, ancestors } or null.
 */
export function queryNodeAt(tree, source, line, col) {
    const targetRow = line - 1;
    const targetCol = col - 1;

    let deepest = null;
    let deepestSize = Infinity;

    walk(tree.rootNode, (node) => {
        const s = node.startPosition;
        const e = node.endPosition;
        if (s.row > targetRow || e.row < targetRow) return false;
        if (s.row === targetRow && s.column > targetCol) return false;
        if (e.row === targetRow && e.column < targetCol) return false;

        const size = (e.row - s.row) * 100000 + Math.abs(e.column - s.column);
        if (size < deepestSize && node.namedChildren.length === 0) {
            deepest = node;
            deepestSize = size;
        }
        return false;
    });

    // If no leaf found, find the smallest containing node of any kind
    if (!deepest) {
        walk(tree.rootNode, (node) => {
            const s = node.startPosition;
            const e = node.endPosition;
            if (s.row > targetRow || e.row < targetRow) return false;
            if (s.row === targetRow && s.column > targetCol) return false;
            if (e.row === targetRow && e.column < targetCol) return false;

            const size = (e.row - s.row) * 100000 + Math.abs(e.column - s.column);
            if (size < deepestSize) {
                deepest = node;
                deepestSize = size;
            }
            return false;
        });
    }

    if (!deepest) return null;

    const ancestors = [];
    let cur = deepest.parent;
    while (cur && ancestors.length < 10) {
        ancestors.push({ type: cur.type, text: textOf(cur, source).substring(0, 80) });
        cur = cur.parent;
    }

    return {
        type: deepest.type,
        text: textOf(deepest, source),
        line: deepest.startPosition.row + 1,
        col: deepest.startPosition.column + 1,
        ancestors,
    };
}

// ---------------------------------------------------------------------------
// Scheduling analysis
// ---------------------------------------------------------------------------

/**
 * Analyze scheduling risks in all rules.
 * Returns [{ rule, line, moduleName, registerWrites, methodCalls, submodules, risk }]
 */
export function analyzeScheduling(tree, source, file) {
    const rules = extractRules(tree, source, file);
    const writes = extractRegWrites(tree, source, file);
    const calls = extractCalls(tree, source, file);

    return rules.map(rule => {
        const ruleWrites = writes.filter(w => w.ruleName === rule.name);
        const ruleCalls = calls.filter(c => c.ruleName === rule.name && c.isMethodCall);
        const targets = new Set(ruleCalls.map(c => c.target).filter(Boolean));

        return {
            rule: rule.name,
            line: rule.line,
            moduleName: rule.moduleName,
            registerWrites: ruleWrites.map(w => ({ reg: w.reg, line: w.line })),
            methodCalls: ruleCalls.map(c => ({ target: c.target, method: c.method, line: c.line })),
            touchesSubmodules: targets.size,
            submodules: [...targets],
            risk: targets.size >= 2 ? 'HIGH' : targets.size === 1 ? 'LOW' : 'NONE',
        };
    });
}

// ---------------------------------------------------------------------------
// Batch: extract everything
// ---------------------------------------------------------------------------

/**
 * Extract all structural info from a .bsv file.
 */
export function extractAll(filePath) {
    const parsed = parseFile(filePath);
    if (!parsed) return { error: `Cannot parse: ${filePath}` };

    const { tree, source } = parsed;

    return {
        file: filePath,
        modules: extractModules(tree, source, filePath),
        rules: extractRules(tree, source, filePath),
        methods: extractMethods(tree, source, filePath),
        interfaceMethods: extractInterfaceMethods(tree, source, filePath),
        submodules: extractSubmoduleInstances(tree, source, filePath),
        registers: extractRegDeclarations(tree, source, filePath),
        calls: extractCalls(tree, source, filePath),
        regWrites: extractRegWrites(tree, source, filePath),
        conflicts: findConflictPairs(tree, source, filePath),
    };
}
