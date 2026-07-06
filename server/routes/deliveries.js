const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/deliveries
// GET /api/deliveries
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date, date, tank_id } = req.query;

    let query = supabaseAdmin
      .from('tanker_deliveries')
      .select('*')
      .order('delivery_date', { ascending: false });

    // Exact date filter — used by MeterBook and TankStock delivery checkbox
    if (date) query = query.eq('delivery_date', date);

    // Tank filter — used by TankStock to get the right tank's delivery
    if (tank_id) query = query.eq('tank_id', tank_id);

    // Range filters — used by delivery history views
    if (start_date) query = query.gte('delivery_date', start_date);
    if (end_date)   query = query.lte('delivery_date', end_date);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

// POST /api/deliveries
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      delivery_date, fuel_type, tank_id,
      bol_number, truck_registration, driver_name,
      expected_litres, actual_litres
    } = req.body;

    if (!delivery_date || !fuel_type || !tank_id || !bol_number || !truck_registration) {
      return res.status(400).json({ error: 'delivery_date, fuel_type, tank_id, bol_number, and truck_registration are required' });
    }

    const shortage_litres = (parseFloat(expected_litres) || 0) - (parseFloat(actual_litres) || 0);

    const { data, error } = await supabaseAdmin
      .from('tanker_deliveries')
      .insert({
        delivery_date, fuel_type, tank_id,
        bol_number, truck_registration, driver_name,
        expected_litres: expected_litres || 0,
        actual_litres: actual_litres || 0,
        shortage_litres,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save delivery' });
  }
});

module.exports = router;