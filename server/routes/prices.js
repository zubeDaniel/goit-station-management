const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/prices
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('fuel_prices')
      .select('*')
      .order('effective_date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// GET /api/prices/current
router.get('/current', authenticate, adminOrManager, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const results = {};

    for (const fuel of ['SXP', 'DXP']) {
      const { data, error } = await supabaseAdmin
        .from('fuel_prices')
        .select('*')
        .eq('fuel_type', fuel)
        .lte('effective_date', today)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single();
      if (!error) results[fuel] = data;
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current prices' });
  }
});

// POST /api/prices
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { fuel_type, price_per_litre, effective_date, npa_reference } = req.body;
    if (!fuel_type || !price_per_litre || !effective_date) {
      return res.status(400).json({ error: 'fuel_type, price_per_litre, and effective_date are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('fuel_prices')
      .insert({ fuel_type, price_per_litre, effective_date, npa_reference, updated_by: req.user.id })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create price entry' });
  }
});

module.exports = router;