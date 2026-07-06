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
      rtt_litres
    } = req.body;

    if (!reading_date || !pump_id || !fuel_type || closing_meter === undefined) {
      return res.status(400).json({ error: 'reading_date, pump_id, fuel_type, and closing_meter are required' });
    }

    if (closing_meter < opening_meter) {
      return res.status(400).json({ error: 'Closing meter cannot be less than opening meter' });
    }

    const litres_sold = parseFloat(closing_meter) - parseFloat(opening_meter || 0);

    // Effective price for this fuel type as of reading_date — not "current" price
    const { data: priceRow } = await supabaseAdmin
      .from('fuel_prices')
      .select('price_per_litre')
      .eq('fuel_type', fuel_type)
      .lte('effective_date', reading_date)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const amount_ghs = litres_sold * (parseFloat(priceRow?.price_per_litre) || 0);

    const { data, error } = await supabaseAdmin
      .from('pump_meter_readings')
      .insert({
        reading_date, pump_id, fuel_type,
        attendant_id, opening_meter, closing_meter,
        litres_sold,
        amount_ghs,
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
    const { closing_meter, attendant_id, rtt_litres } = req.body;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('pump_meter_readings')
      .select('reading_date, fuel_type, opening_meter, closing_meter')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Meter reading not found' });
    }

    const finalClosing = closing_meter !== undefined ? closing_meter : existing.closing_meter;
    const litres_sold = parseFloat(finalClosing) - parseFloat(existing.opening_meter || 0);

    const { data: priceRow } = await supabaseAdmin
      .from('fuel_prices')
      .select('price_per_litre')
      .eq('fuel_type', existing.fuel_type)
      .lte('effective_date', existing.reading_date)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const amount_ghs = litres_sold * (parseFloat(priceRow?.price_per_litre) || 0);

    const { data, error } = await supabaseAdmin
      .from('pump_meter_readings')
      .update({ closing_meter, attendant_id, litres_sold, amount_ghs, rtt_litres })
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