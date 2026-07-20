import { queryReportSummary, queryAllErrors, queryError, queryAllCapturesByCode, queryUpdateError, queryDeleteError, queryListCaptures, queryCountCaptures, queryDeleteCapture, queryListSessions, queryExportKnowledge, queryImportKnowledge, queryErrorTrend, queryFixRateTrend, queryKnowledgeGrowth, queryFileHotspots, queryWeeklyTopErrors, querySearch } from "../db/query.mjs";
import { readFileSync } from "fs";
import { resolve as resolvePath, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = readFileSync(resolvePath(__dirname, '../dashboard.html'), 'utf-8');

const MGMT_PORT = parseInt(process.env.SPECMATE_PORT || '9339', 10);

// ── Dashboard API helpers ──

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
        });
    });
}

function apiResponse(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function apiError(res, message, status = 400) {
    apiResponse(res, { error: message }, status);
}

// ── Management route handler (Dashboard + API) — shared by both transports ──
export async function handleManagementRoutes(req, res) {
    // Dashboard page
    if (req.method === 'GET' && req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(DASHBOARD_HTML);
        return true;
    }

    // API routes
    if (req.url.startsWith('/api/')) {
        const url = new URL(req.url, `http://127.0.0.1:${MGMT_PORT}`);
        const path = url.pathname;

        // GET /api/summary
        if (req.method === 'GET' && path === '/api/summary') {
            try {
                const summary = await queryReportSummary();
                apiResponse(res, summary);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/errors
        if (req.method === 'GET' && path === '/api/errors') {
            try {
                const errors = await queryAllErrors();
                apiResponse(res, errors);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/errors/:code
        const errorDetailMatch = path.match(/^\/api\/errors\/([^/]+)$/);
        if (req.method === 'GET' && errorDetailMatch) {
            try {
                const code = errorDetailMatch[1];
                const err = await queryError(code);
                if (!err) { apiError(res, 'Error not found', 404); return true; }
                const captures = await queryAllCapturesByCode(code);
                apiResponse(res, { error: err, captures });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // PUT /api/errors/:code
        if (req.method === 'PUT' && errorDetailMatch) {
            try {
                const code = errorDetailMatch[1];
                const body = await parseBody(req);
                await queryUpdateError(code, body);
                apiResponse(res, { ok: true });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // DELETE /api/errors/:code
        if (req.method === 'DELETE' && errorDetailMatch) {
            try {
                const code = errorDetailMatch[1];
                await queryDeleteError(code);
                apiResponse(res, { ok: true });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/captures
        if (req.method === 'GET' && path === '/api/captures') {
            try {
                const page = parseInt(url.searchParams.get('page') || '1', 10);
                const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
                const status = url.searchParams.get('status') || null;
                const code = url.searchParams.get('code') || null;
                const items = await queryListCaptures({ page, pageSize, status, code });
                const total = await queryCountCaptures({ status, code });
                apiResponse(res, { items, total, page, pageSize });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // DELETE /api/captures/:id
        const captureDeleteMatch = path.match(/^\/api\/captures\/(\d+)$/);
        if (req.method === 'DELETE' && captureDeleteMatch) {
            try {
                const id = parseInt(captureDeleteMatch[1], 10);
                await queryDeleteCapture(id);
                apiResponse(res, { ok: true });
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/sessions
        if (req.method === 'GET' && path === '/api/sessions') {
            try {
                const sessions = await queryListSessions();
                apiResponse(res, sessions);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/export
        if (req.method === 'GET' && path === '/api/export') {
            try {
                const data = await queryExportKnowledge();
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Disposition': 'attachment; filename="specmate-knowledge.json"',
                });
                res.end(JSON.stringify(data));
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // POST /api/import
        if (req.method === 'POST' && path === '/api/import') {
            try {
                const body = await parseBody(req);
                const result = await queryImportKnowledge(body);
                apiResponse(res, result);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/trends/errors?granularity=week&topN=5
        if (req.method === 'GET' && path === '/api/trends/errors') {
            try {
                const granularity = url.searchParams.get('granularity') || 'week';
                const topN = parseInt(url.searchParams.get('topN') || '5', 10);
                if (isNaN(topN) || topN < 1) { apiError(res, 'Invalid topN parameter', 400); return true; }
                const data = await queryErrorTrend({ granularity, topN });
                apiResponse(res, data);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/trends/fix-rate
        if (req.method === 'GET' && path === '/api/trends/fix-rate') {
            try {
                const data = await queryFixRateTrend();
                apiResponse(res, data);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/trends/knowledge-growth
        if (req.method === 'GET' && path === '/api/trends/knowledge-growth') {
            try {
                const data = await queryKnowledgeGrowth();
                apiResponse(res, data);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/hotspots?topN=10
        if (req.method === 'GET' && path === '/api/hotspots') {
            try {
                const topN = parseInt(url.searchParams.get('topN') || '10', 10);
                if (isNaN(topN) || topN < 1) { apiError(res, 'Invalid topN parameter', 400); return true; }
                const data = await queryFileHotspots(topN);
                apiResponse(res, data);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/weekly-top-errors?topN=5&weeks=4
        if (req.method === 'GET' && path === '/api/weekly-top-errors') {
            try {
                const topN = parseInt(url.searchParams.get('topN') || '5', 10);
                if (isNaN(topN) || topN < 1) { apiError(res, 'Invalid topN parameter', 400); return true; }
                const weeks = parseInt(url.searchParams.get('weeks') || '4', 10);
                if (isNaN(weeks) || weeks < 1) { apiError(res, 'Invalid weeks parameter', 400); return true; }
                const data = await queryWeeklyTopErrors(topN, weeks);
                apiResponse(res, data);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        // GET /api/search?q=keyword
        if (req.method === 'GET' && path === '/api/search') {
            try {
                const q = url.searchParams.get('q') || '';
                if (!q) { apiError(res, 'Missing query parameter q', 400); return true; }
                const data = await querySearch(q);
                apiResponse(res, data);
            } catch (err) { apiError(res, err.message, 500); }
            return true;
        }

        apiError(res, 'Not Found', 404);
        return true;
    }

    return false; // not a management route
}
