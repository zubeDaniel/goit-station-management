const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/suggestions
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('price_update_suggestions')
      .select('*, users!fetched_by(name)')
      .order('fetched_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// POST /api/suggestions
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { fuel_type, suggested_price_per_litre, npa_reference } = req.body;

    if (!fuel_type || !suggested_price_per_litre) {
      return res.status(400).json({ error: 'fuel_type and suggested_price_per_litre are required' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('price_update_suggestions')
      .insert({
        fuel_type, suggested_price_per_litre,
        npa_reference, fetched_by: req.user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save suggestion' });
  }
});

// POST /api/suggestions/:id/approve — Admin only
router.post('/:id/approve', authenticate, adminOnly, async (req, res) => {
  try {
    const { data: suggestion, error: fetchError } = await req.supabaseAdmin
      .from('price_update_suggestions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Write to fuel_prices
    const { error: priceError } = await req.supabaseAdmin.from('fuel_prices').insert({
      fuel_type: suggestion.fuel_type,
      price_per_litre: suggestion.suggested_price_per_litre,
      effective_date: new Date().toISOString().split('T')[0],
      npa_reference: suggestion.npa_reference,
      updated_by: req.user.id
    });

    if (priceError) {
      return res.status(500).json({ error: `Failed to apply price: ${priceError.message}` });
    }

    // Mark approved
    const { data, error } = await req.supabaseAdmin
      .from('price_update_suggestions')
      .update({
        status: 'approved',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve suggestion' });
  }
});

// POST /api/suggestions/:id/reject — Admin only
router.post('/:id/reject', authenticate, adminOnly, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('price_update_suggestions')
      .update({
        status: 'rejected',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject suggestion' });
  }
});

module.exports = router;