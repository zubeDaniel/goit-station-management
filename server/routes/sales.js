const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/sales
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = supabaseAdmin
      .from('sales_book')
      .select('*')
      .order('entry_date', { ascending: false });

    if (start_date) query = query.gte('entry_date', start_date);
    if (end_date) query = query.lte('entry_date', end_date);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sales book' });
  }
});

// POST /api/sales
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      entry_date, coupons_ghs, gocard_ghs,
      momo_ghs, merka_wood_ghs, genset_ghs,
      lubricant_ghs, meter_amount_ghs
    } = req.body;

    if (!entry_date) {
      return res.status(400).json({ error: 'entry_date is required' });
    }

    // RTT is NEVER accepted as input here
    const { data, error } = await supabaseAdmin
      .from('sales_book')
      .insert({
        entry_date,
        coupons_ghs: coupons_ghs || 0,
        gocard_ghs: gocard_ghs || 0,
        momo_ghs: momo_ghs || 0,
        merka_wood_ghs: merka_wood_ghs || 0,
        genset_ghs: genset_ghs || 0,
        lubricant_ghs: lubricant_ghs || 0,
        meter_amount_ghs: meter_amount_ghs || 0,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `A sales entry for ${entry_date} already exists. There is currently no edit function — this is a known gap, not something you did wrong.` });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save sales entry' });
  }
});

module.exports = router;