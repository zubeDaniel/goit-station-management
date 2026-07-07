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
      gocard_ghs, coupons_50_ghs, coupons_100_ghs
    } = req.body;

    if (!entry_date) {
      return res.status(400).json({ error: 'entry_date is required' });
    }

    const total_banked_ghs =
      (parseFloat(nib_ghs) || 0) +
      (parseFloat(umb_momo_ghs) || 0) +
      (parseFloat(gocard_ghs) || 0) +
      (parseFloat(coupons_50_ghs) || 0) +
      (parseFloat(coupons_100_ghs) || 0);

    // variance_vs_sales = total_banked − sales_book total for the same date
    const { data: salesRow } = await supabaseAdmin
      .from('sales_book')
      .select('total_sales_ghs')
      .eq('entry_date', entry_date)
      .maybeSingle();

    const variance_vs_sales = total_banked_ghs - (parseFloat(salesRow?.total_sales_ghs) || 0);

    const { data, error } = await supabaseAdmin
      .from('banking')
      .insert({
        entry_date,
        nib_ghs: nib_ghs || 0,
        umb_momo_ghs: umb_momo_ghs || 0,
        gocard_ghs: gocard_ghs || 0,
        coupons_50_ghs: coupons_50_ghs || 0,
        coupons_100_ghs: coupons_100_ghs || 0,
        variance_vs_sales,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `A banking entry for ${entry_date} already exists. There is currently no edit function — this is a known gap, not something you did wrong.` });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save banking entry' });
  }
});

module.exports = router;