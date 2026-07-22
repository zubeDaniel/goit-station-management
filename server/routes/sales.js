const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager } = require('../middleware/auth');

// Derive meter_amount_ghs from actual pump_meter_readings for the given
// date, rather than trusting whatever the client sends. This field is the
// entire point of the Sales Book's "cross-check vs meter" reconciliation —
// it exists to catch a mismatch between reported sales and what the pumps
// actually recorded. Previously the frontend auto-filled it from a GET
// /meter call but left the field editable, and the server just inserted
// whatever arrived — meaning the one number meant to catch a shortfall
// could be silently overwritten, by a bug or otherwise, with no backstop.
async function deriveMeterAmount(supabaseAdmin, entryDate) {
  const { data: readings, error } = await supabaseAdmin
    .from('pump_meter_readings')
    .select('amount_ghs')
    .eq('reading_date', entryDate);
  if (error) throw new Error(`Failed to derive meter amount: ${error.message}`);
  return (readings || []).reduce((sum, r) => sum + (parseFloat(r.amount_ghs) || 0), 0);
}

// GET /api/sales
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = req.supabaseAdmin
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
      lubricant_ghs
    } = req.body;

    if (!entry_date) {
      return res.status(400).json({ error: 'entry_date is required' });
    }
    // This table is cross-checked against meter_amount_ghs specifically to
    // catch reporting mismatches — a negative channel value would defeat
    // that check silently instead of surfacing a real variance.
    for (const [field, value] of Object.entries({ coupons_ghs, gocard_ghs, momo_ghs, merka_wood_ghs, genset_ghs, lubricant_ghs })) {
      if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        return res.status(400).json({ error: `${field} must be a non-negative number` });
      }
    }
    if (entry_date > new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ error: 'entry_date cannot be in the future' });
    }

    const meterAmountGhs = await deriveMeterAmount(req.supabaseAdmin, entry_date);

    // RTT is NEVER accepted as input here. meter_amount_ghs is never
    // accepted from the client either — see deriveMeterAmount() above.
    const { data, error } = await req.supabaseAdmin
      .from('sales_book')
      .insert({
        entry_date,
        coupons_ghs: coupons_ghs || 0,
        gocard_ghs: gocard_ghs || 0,
        momo_ghs: momo_ghs || 0,
        merka_wood_ghs: merka_wood_ghs || 0,
        genset_ghs: genset_ghs || 0,
        lubricant_ghs: lubricant_ghs || 0,
        meter_amount_ghs: meterAmountGhs,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `A sales entry for ${entry_date} already exists — edit that entry instead of creating a new one.` });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save sales entry' });
  }
});

// PUT /api/sales/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      coupons_ghs, gocard_ghs,
      momo_ghs, merka_wood_ghs, genset_ghs,
      lubricant_ghs
    } = req.body;

    // entry_date isn't editable here (matches the frontend, which locks
    // the date field once editing an existing entry), so look up the
    // row's own date to know which day's meter readings to derive from.
    const { data: existing, error: fetchError } = await req.supabaseAdmin
      .from('sales_book')
      .select('entry_date')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Sales entry not found' });
    }

    for (const [field, value] of Object.entries({ coupons_ghs, gocard_ghs, momo_ghs, merka_wood_ghs, genset_ghs, lubricant_ghs })) {
      if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        return res.status(400).json({ error: `${field} must be a non-negative number` });
      }
    }

    const meterAmountGhs = await deriveMeterAmount(req.supabaseAdmin, existing.entry_date);

    const { data, error } = await req.supabaseAdmin
      .from('sales_book')
      .update({
        coupons_ghs: coupons_ghs || 0,
        gocard_ghs: gocard_ghs || 0,
        momo_ghs: momo_ghs || 0,
        merka_wood_ghs: merka_wood_ghs || 0,
        genset_ghs: genset_ghs || 0,
        lubricant_ghs: lubricant_ghs || 0,
        meter_amount_ghs: meterAmountGhs,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update sales entry' });
  }
});

// DELETE /api/sales/:id
router.delete('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('sales_book')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Sales entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete sales entry' });
  }
});

module.exports = router;