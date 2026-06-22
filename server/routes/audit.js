const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOnly } = require('../middleware/auth');

// GET /api/audit — Admin only
router.get('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { table_name, changed_by, start_date, end_date, limit = 100 } = req.query;
    let query = supabaseAdmin
      .from('audit_log')
      .select('*, users(name, email)')
      .order('changed_at', { ascending: false })
      .limit(parseInt(limit));

    if (table_name) query = query.eq('table_name', table_name);
    if (changed_by) query = query.eq('changed_by', changed_by);
    if (start_date) query = query.gte('changed_at', start_date);
    if (end_date) query = query.lte('changed_at', end_date);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

module.exports = router;