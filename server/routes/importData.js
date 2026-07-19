const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/import/log
router.get('/log', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('import_log')
      .select('*, users(name)')
      .order('imported_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch import log' });
  }
});

// POST /api/import/preview — parse and validate
router.post('/preview', authenticate, adminOrManager, async (req, res) => {
  try {
    const { rows, sheet_type } = req.body;
    if (!rows || !sheet_type) {
      return res.status(400).json({ error: 'rows and sheet_type are required' });
    }
    // Return preview stats
    res.json({
      total: rows.length,
      sheet_type,
      preview: rows.slice(0, 5),
      message: 'Preview ready'
    });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed' });
  }
});

// POST /api/import/execute — log a completed historical import
//
// CORRECTION vs. the original audit finding on this route: the actual
// row-by-row import already works and always has — it happens entirely
// client-side in ImportData.jsx, which parses the uploaded Excel file and
// posts each row directly to the real, validated per-module endpoints
// (/meter, /sales, /banking, /creditors/credit-sales, /expenses) — the
// exact same endpoints manual daily entry uses, so every row gets the same
// validation and derivation (e.g. sales.js's server-derived meter_amount_ghs
// applies equally to imported rows).
//
// What this route previously got wrong was assuming IT was responsible for
// writing rows — it expected a raw `rows` array and was supposed to insert
// them itself. The frontend never actually called it that way; it never
// called this route AT ALL. The result: real historical data really was
// being imported successfully, but zero record of it ever appeared in
// import_log, so there was no audit trail of when an import happened, by
// whom, or how many rows — which the mockup's "Import history" table and
// the PRD's import_log table both assume exists.
//
// This route's job now matches what the frontend actually needs: log a
// summary of an import that has already happened, rather than perform one
// itself. See ImportData.jsx's call to this route after handleImportAll /
// handleImportSingle finish.
router.post('/execute', authenticate, adminOrManager, async (req, res) => {
  try {
    const { filename, import_type, rows_imported, rows_skipped, warnings } = req.body;

    if (!filename || rows_imported === undefined || rows_skipped === undefined) {
      return res.status(400).json({ error: 'filename, rows_imported, and rows_skipped are required' });
    }

    const status = rows_imported === 0 && rows_skipped > 0
      ? 'failed'
      : rows_skipped > 0
        ? 'partial'
        : 'success';

    const { data, error } = await req.supabaseAdmin
      .from('import_log')
      .insert({
        import_type: import_type === 'daily' ? 'daily' : 'historical',
        filename,
        imported_by: req.user.id,
        rows_imported,
        rows_skipped,
        warnings: warnings || [],
        status
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log import' });
  }
});

module.exports = router;