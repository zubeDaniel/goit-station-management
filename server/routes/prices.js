const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/prices
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
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
      const { data, error } = await req.supabaseAdmin
        .from('fuel_prices')
        .select('*')
        .eq('fuel_type', fuel)
        .lte('effective_date', today)
        // Secondary sort on created_at as a deterministic tie-break — two
        // rows sharing the same effective_date (possible with existing
        // pre-migration-007 data) should resolve to the most recently
        // entered one, not an arbitrary one.
        .order('effective_date', { ascending: false })
        .order('created_at', { ascending: false })
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
// Real upsert against the (fuel_type, effective_date) unique constraint
// added in migrations/007 — updating the same day's price now correctly
// overwrites that day's entry instead of creating an ambiguous duplicate.
// Previously always inserted; two updates for the same date created two
// rows, and which one GET /current showed was undefined — the reported
// "doesn't update when I use it" symptom.
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { fuel_type, price_per_litre, effective_date, npa_reference } = req.body;
    if (!fuel_type || !price_per_litre || !effective_date) {
      return res.status(400).json({ error: 'fuel_type, price_per_litre, and effective_date are required' });
    }
    if (!Number.isFinite(Number(price_per_litre)) || Number(price_per_litre) <= 0) {
      return res.status(400).json({ error: 'price_per_litre must be a positive number' });
    }
    // Deliberately NOT adding a "cannot be in the future" guard here.
    // Unlike meter/sales/deliveries/tank-stock — which record something
    // that already physically happened — NPA bulletins are routinely
    // published ahead of their effective date, and pre-entering that price
    // before it takes effect is a legitimate, sensible workflow. Blocking
    // it would fix a clock-skew edge case by breaking the common case.

    const { data, error } = await req.supabaseAdmin
      .from('fuel_prices')
      .upsert(
        { fuel_type, price_per_litre, effective_date, npa_reference, updated_by: req.user.id },
        { onConflict: 'fuel_type,effective_date' }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create price entry' });
  }
});

module.exports = router;