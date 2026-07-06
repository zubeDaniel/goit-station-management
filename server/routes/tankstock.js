const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/tank-stock
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date, tank_id } = req.query;
    let query = supabaseAdmin
      .from('tank_stock')
      .select('*')
      .order('stock_date', { ascending: false });

    if (start_date) query = query.gte('stock_date', start_date);
    if (end_date) query = query.lte('stock_date', end_date);
    if (tank_id) query = query.eq('tank_id', tank_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tank stock' });
  }
});

// POST /api/tank-stock
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      stock_date, tank_id, fuel_type,
      opening_stock, litres_sold, delivery_litres,
      closing_stock_dip, actual_variance, expected_variance
    } = req.body;

    if (!stock_date || !tank_id || !fuel_type || closing_stock_dip === undefined) {
      return res.status(400).json({ error: 'stock_date, tank_id, fuel_type, and closing_stock_dip are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('tank_stock')
      .insert({
        stock_date, tank_id, fuel_type,
        opening_stock: opening_stock || 0,
        litres_sold: litres_sold || 0,
        delivery_litres: delivery_litres || 0,
        closing_stock_dip,
        actual_variance: actual_variance || 0,
        expected_variance: expected_variance || 0,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save tank stock' });
  }
});

module.exports = router;