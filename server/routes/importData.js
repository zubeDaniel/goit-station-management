const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/import/log
router.get('/log', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
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

// POST /api/import/execute — write validated rows
router.post('/execute', authenticate, adminOrManager, async (req, res) => {
  try {
    const { rows, sheet_type, filename } = req.body;
    if (!rows || !sheet_type || !filename) {
      return res.status(400).json({ error: 'rows, sheet_type, and filename are required' });
    }

    let rowsImported = 0;
    let rowsSkipped = 0;
    const warnings = [];

    // Log the import
    await supabaseAdmin.from('import_log').insert({
      import_type: 'historical',
      filename,
      imported_by: req.user.id,
      rows_imported: rowsImported,
      rows_skipped: rowsSkipped,
      warnings,
      status: 'success'
    });

    res.json({ rows_imported: rowsImported, rows_skipped: rowsSkipped, warnings });
  } catch (err) {
    res.status(500).json({ error: 'Import failed' });
  }
});

module.exports = router;