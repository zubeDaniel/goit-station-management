const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/deliveries
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date, date, tank_id } = req.query;

    let query = req.supabaseAdmin
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
    // expected_litres/actual_litres are optional (default 0), so 0 must stay
    // valid — only reject non-numeric or negative values, not falsy-but-zero.
    if (expected_litres !== undefined && (!Number.isFinite(Number(expected_litres)) || Number(expected_litres) < 0)) {
      return res.status(400).json({ error: 'expected_litres must be a non-negative number' });
    }
    if (actual_litres !== undefined && (!Number.isFinite(Number(actual_litres)) || Number(actual_litres) < 0)) {
      return res.status(400).json({ error: 'actual_litres must be a non-negative number' });
    }
    if (delivery_date > new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ error: 'delivery_date cannot be in the future' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('tanker_deliveries')
      .insert({
        delivery_date, fuel_type, tank_id,
        bol_number, truck_registration, driver_name,
        expected_litres: expected_litres || 0,
        actual_litres: actual_litres || 0,
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

// PUT /api/deliveries/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      delivery_date, fuel_type, tank_id,
      bol_number, truck_registration, driver_name,
      expected_litres, actual_litres
    } = req.body;

    if (!delivery_date || !fuel_type || !tank_id || !bol_number || !truck_registration) {
      return res.status(400).json({ error: 'delivery_date, fuel_type, tank_id, bol_number, and truck_registration are required' });
    }
    // expected_litres/actual_litres are optional (default 0), so 0 must stay
    // valid — only reject non-numeric or negative values, not falsy-but-zero.
    if (expected_litres !== undefined && (!Number.isFinite(Number(expected_litres)) || Number(expected_litres) < 0)) {
      return res.status(400).json({ error: 'expected_litres must be a non-negative number' });
    }
    if (actual_litres !== undefined && (!Number.isFinite(Number(actual_litres)) || Number(actual_litres) < 0)) {
      return res.status(400).json({ error: 'actual_litres must be a non-negative number' });
    }
    if (delivery_date > new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ error: 'delivery_date cannot be in the future' });
    }

    // shortage_litres is GENERATED ALWAYS AS (expected_litres - actual_litres)
    // — never included here, Postgres recomputes it from whatever's set below.
    const { data, error } = await req.supabaseAdmin
      .from('tanker_deliveries')
      .update({
        delivery_date, fuel_type, tank_id,
        bol_number, truck_registration, driver_name,
        expected_litres: expected_litres || 0,
        actual_litres: actual_litres || 0
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Delivery not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update delivery' });
  }
});

// DELETE /api/deliveries/:id
router.delete('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('tanker_deliveries')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Delivery deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete delivery' });
  }
});

module.exports = router;