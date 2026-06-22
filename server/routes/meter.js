const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOnly, adminOrManager, allRoles } = require('../middleware/auth');

// GET /api/meter
router.get('/', authenticate, allRoles, async (req, res) => {
  try {
    const { start_date, end_date, pump_id } = req.query;
    let query = supabaseAdmin
      .from('pump_meter_readings')
      .select('*, attendants(name)')
      .order('reading_date', { ascending: false });

    if (start_date) query = query.gte('reading_date', start_date);
    if (end_date) query = query.lte('reading_date', end_date);
    if (pump_id) query = query.eq('pump_id', pump_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meter readings' });
  }
});

// POST /api/meter
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      reading_date, pump_id, fuel_type,
      attendant_id, opening_meter, closing_meter,
      amount_ghs, rtt_litres
    } = req.body;

    if (!reading_date || !pump_id || !fuel_type || closing_meter === undefined) {
      return res.status(400).json({ error: 'reading_date, pump_id, fuel_type, and closing_meter are required' });
    }

    if (closing_meter < opening_meter) {
      return res.status(400).json({ error: 'Closing meter cannot be less than opening meter' });
    }

    const { data, error } = await supabaseAdmin
      .from('pump_meter_readings')
      .insert({
        reading_date, pump_id, fuel_type,
        attendant_id, opening_meter, closing_meter,
        amount_ghs: amount_ghs || 0,
        rtt_litres: rtt_litres || 0,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save meter reading' });
  }
});

// PUT /api/meter/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      closing_meter, attendant_id,
      amount_ghs, rtt_litres
    } = req.body;

    const { data, error } = await supabaseAdmin
      .from('pump_meter_readings')
      .update({ closing_meter, attendant_id, amount_ghs, rtt_litres })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update meter reading' });
  }
});

module.exports = router;