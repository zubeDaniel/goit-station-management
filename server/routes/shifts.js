const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager, allRoles } = require('../middleware/auth');

// GET /api/shifts
router.get('/', authenticate, allRoles, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = req.supabaseAdmin
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

    const { data, error } = await req.supabaseAdmin
      .from('shifts')
      .insert({ shift_date, pump_id, attendant_id, created_by: req.user.id })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `${pump_id} already has an attendant assigned for ${shift_date} — edit that assignment instead of creating a new one.` });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save shift' });
  }
});

// PUT /api/shifts/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { shift_date, pump_id, attendant_id } = req.body;

    if (!shift_date || !pump_id || !attendant_id) {
      return res.status(400).json({ error: 'shift_date, pump_id, and attendant_id are required' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('shifts')
      .update({ shift_date, pump_id, attendant_id })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `${pump_id} already has an attendant assigned for ${shift_date}.` });
      }
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Shift not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// DELETE /api/shifts/:id
router.delete('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('shifts')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Shift deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

module.exports = router;