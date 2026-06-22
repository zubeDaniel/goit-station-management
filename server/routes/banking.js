const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/banking
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = supabaseAdmin
      .from('banking')
      .select('*')
      .order('entry_date', { ascending: false });

    if (start_date) query = query.gte('entry_date', start_date);
    if (end_date) query = query.lte('entry_date', end_date);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch banking entries' });
  }
});

// POST /api/banking
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      entry_date, nib_ghs, umb_momo_ghs,
      gocard_ghs, coupons_50_ghs, coupons_100_ghs,
      variance_vs_sales
    } = req.body;

    if (!entry_date) {
      return res.status(400).json({ error: 'entry_date is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('banking')
      .insert({
        entry_date,
        nib_ghs: nib_ghs || 0,
        umb_momo_ghs: umb_momo_ghs || 0,
        gocard_ghs: gocard_ghs || 0,
        coupons_50_ghs: coupons_50_ghs || 0,
        coupons_100_ghs: coupons_100_ghs || 0,
        variance_vs_sales: variance_vs_sales || 0,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save banking entry' });
  }
});

module.exports = router;