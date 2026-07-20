const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/banking
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = req.supabaseAdmin
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
    const { data: salesRow } = await req.supabaseAdmin
      .from('sales_book')
      .select('total_sales_ghs')
      .eq('entry_date', entry_date)
      .maybeSingle();

    const variance_vs_sales = total_banked_ghs - (parseFloat(salesRow?.total_sales_ghs) || 0);

    const { data, error } = await req.supabaseAdmin
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
        return res.status(409).json({ error: `A banking entry for ${entry_date} already exists — edit that entry instead of creating a new one.` });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save banking entry' });
  }
});

// PUT /api/banking/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      nib_ghs, umb_momo_ghs,
      gocard_ghs, coupons_50_ghs, coupons_100_ghs
    } = req.body;

    // entry_date is looked up from the existing row, not trusted from the
    // client — same fix already applied to sales.js's PUT. Trusting a
    // client-supplied entry_date here means the variance gets computed
    // against whatever date the client happens to send, which may not
    // match the row actually being edited — a silently wrong
    // reconciliation number, which is the entire point of this table.
    const { data: existing, error: fetchError } = await req.supabaseAdmin
      .from('banking')
      .select('entry_date')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Banking entry not found' });
    }

    const total_banked_ghs =
      (parseFloat(nib_ghs) || 0) +
      (parseFloat(umb_momo_ghs) || 0) +
      (parseFloat(gocard_ghs) || 0) +
      (parseFloat(coupons_50_ghs) || 0) +
      (parseFloat(coupons_100_ghs) || 0);

    const { data: salesRow } = await req.supabaseAdmin
      .from('sales_book')
      .select('total_sales_ghs')
      .eq('entry_date', existing.entry_date)
      .maybeSingle();

    const variance_vs_sales = total_banked_ghs - (parseFloat(salesRow?.total_sales_ghs) || 0);

    const { data, error } = await req.supabaseAdmin
      .from('banking')
      .update({
        nib_ghs: nib_ghs || 0,
        umb_momo_ghs: umb_momo_ghs || 0,
        gocard_ghs: gocard_ghs || 0,
        coupons_50_ghs: coupons_50_ghs || 0,
        coupons_100_ghs: coupons_100_ghs || 0,
        variance_vs_sales,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update banking entry' });
  }
});

// DELETE /api/banking/:id
router.delete('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('banking')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Banking entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete banking entry' });
  }
});

module.exports = router;