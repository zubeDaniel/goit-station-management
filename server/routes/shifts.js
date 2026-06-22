const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager, allRoles } = require('../middleware/auth');

// GET /api/shifts
router.get('/', authenticate, allRoles, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = supabaseAdmin
      .from('shifts')
      .select('*, attendants(name)')
      .order('shift_date', { ascending: false });

    if (start_date) query = query.gte('shift_date', start_date);
    if (end_date) query = query.lte('shift_date', end_date);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// POST /api/shifts
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { shift_date, pump_id, attendant_id } = req.body;

    if (!shift_date || !pump_id || !attendant_id) {
      return res.status(400).json({ error: 'shift_date, pump_id, and attendant_id are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .insert({ shift_date, pump_id, attendant_id, created_by: req.user.id })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save shift' });
  }
});

module.exports = router;