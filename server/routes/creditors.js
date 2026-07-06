const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/creditors
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
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

    const { data, error } = await supabaseAdmin
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
    let query = supabaseAdmin
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
      const { data: priceRow } = await supabaseAdmin
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
    const total = computedSxpAmount + computedDxpAmount;

    const { data, error } = await supabaseAdmin
      .from('credit_sales')
      .insert({
        sale_date, creditor_id,
        sxp_litres: sxp_litres || 0,
        dxp_litres: dxp_litres || 0,
        sxp_amount_ghs: computedSxpAmount,
        dxp_amount_ghs: computedDxpAmount,
        total_amount_ghs: total,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Update creditor balance
    const { data: creditor } = await supabaseAdmin
      .from('creditors')
      .select('current_balance_ghs')
      .eq('id', creditor_id)
      .single();

    if (creditor) {
      const newBalance = parseFloat(creditor.current_balance_ghs || 0) + total;
      const { error: balanceError } = await supabaseAdmin
        .from('creditors')
        .update({ current_balance_ghs: newBalance })
        .eq('id', creditor_id);
      if (balanceError) console.error('Failed to update creditor balance:', balanceError.message);
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save credit sale' });
  }
});

// POST /api/creditors/payments
router.post('/payments', authenticate, adminOrManager, async (req, res) => {
  try {
    const { payment_date, creditor_id, amount_ghs, payment_method, reference } = req.body;

    if (!payment_date || !creditor_id || !amount_ghs) {
      return res.status(400).json({ error: 'payment_date, creditor_id, and amount_ghs are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('creditor_payments')
      .insert({
        payment_date, creditor_id,
        amount_ghs, payment_method, reference,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Reduce creditor balance
    const { data: creditor } = await supabaseAdmin
      .from('creditors')
      .select('current_balance_ghs')
      .eq('id', creditor_id)
      .single();

    if (creditor) {
      const newBalance = Math.max(0, parseFloat(creditor.current_balance_ghs) - parseFloat(amount_ghs));
      await supabaseAdmin
        .from('creditors')
        .update({ current_balance_ghs: newBalance })
        .eq('id', creditor_id);
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save payment' });
  }
});

module.exports = router;