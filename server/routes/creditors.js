const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/creditors
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('creditors')
      .select('*')
      .is('deleted_at', null)
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch creditors' });
  }
});

// POST /api/creditors
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { name, contact_name, contact_phone, credit_limit_ghs } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data, error } = await req.supabaseAdmin
      .from('creditors')
      .insert({ name, contact_name, contact_phone, credit_limit_ghs: credit_limit_ghs || 0 })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create creditor' });
  }
});

// GET /api/creditors/credit-sales
router.get('/credit-sales', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date, creditor_id } = req.query;
    let query = req.supabaseAdmin
      .from('credit_sales')
      .select('*, creditors(name)')
      .is('deleted_at', null)
      .order('sale_date', { ascending: false });

    if (start_date) query = query.gte('sale_date', start_date);
    if (end_date) query = query.lte('sale_date', end_date);
    if (creditor_id) query = query.eq('creditor_id', creditor_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch credit sales' });
  }
});

// POST /api/creditors/credit-sales
router.post('/credit-sales', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      sale_date, creditor_id,
      sxp_litres, dxp_litres,
      sxp_amount_ghs, dxp_amount_ghs
    } = req.body;

    if (!sale_date || !creditor_id) {
      return res.status(400).json({ error: 'sale_date and creditor_id are required' });
    }

    // Recompute amounts server-side using the price effective on sale_date —
    // not whatever the client sent, which uses "current" price regardless of
    // which date was actually selected (wrong when backfilling a past date)
    const getEffectivePrice = async (fuelType) => {
      const { data: priceRow } = await req.supabaseAdmin
        .from('fuel_prices')
        .select('price_per_litre')
        .eq('fuel_type', fuelType)
        .lte('effective_date', sale_date)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return parseFloat(priceRow?.price_per_litre) || 0;
    };

    const sxpPrice = await getEffectivePrice('SXP');
    const dxpPrice = await getEffectivePrice('DXP');
    const computedSxpAmount = (parseFloat(sxp_litres) || 0) * sxpPrice;
    const computedDxpAmount = (parseFloat(dxp_litres) || 0) * dxpPrice;

    // The insert and the balance update happen together, atomically, inside
    // one Postgres function — see migrations/006_creditor_balance_functions.sql.
    // Previously these were two separate app-layer steps (read balance,
    // compute, write back), which had a race condition under concurrent use
    // and silently swallowed balance-update failures while still returning
    // 201. Now either both succeed or neither does, and a failure here is a
    // real error returned to the client, not a console.error nobody sees.
    const { data, error } = await req.supabaseAdmin.rpc('record_credit_sale', {
      p_sale_date: sale_date,
      p_creditor_id: creditor_id,
      p_sxp_litres: sxp_litres || 0,
      p_dxp_litres: dxp_litres || 0,
      p_sxp_amount_ghs: computedSxpAmount,
      p_dxp_amount_ghs: computedDxpAmount,
      p_created_by: req.user.id
    }).single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save credit sale' });
  }
});

// GET /api/creditors/payments
router.get('/payments', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date, creditor_id } = req.query;
    let query = req.supabaseAdmin
      .from('creditor_payments')
      .select('*, creditors(name)')
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });

    if (start_date) query = query.gte('payment_date', start_date);
    if (end_date) query = query.lte('payment_date', end_date);
    if (creditor_id) query = query.eq('creditor_id', creditor_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// POST /api/creditors/payments
router.post('/payments', authenticate, adminOrManager, async (req, res) => {
  try {
    const { payment_date, creditor_id, amount_ghs, payment_method, reference } = req.body;

    if (!payment_date || !creditor_id || !amount_ghs) {
      return res.status(400).json({ error: 'payment_date, creditor_id, and amount_ghs are required' });
    }

    // Atomic — see migrations/006_creditor_balance_functions.sql. The
    // previous version didn't even check for an error on the balance
    // update at all; a failed update here would leave the payment
    // recorded but the balance permanently overstated, with no error
    // anywhere. Now it's one transaction: both happen or neither does.
    const { data, error } = await req.supabaseAdmin.rpc('record_creditor_payment', {
      p_payment_date: payment_date,
      p_creditor_id: creditor_id,
      p_amount_ghs: amount_ghs,
      p_payment_method: payment_method,
      p_reference: reference,
      p_created_by: req.user.id
    }).single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save payment' });
  }
});

module.exports = router;