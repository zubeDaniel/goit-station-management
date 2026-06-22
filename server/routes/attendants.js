const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/attendants
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('attendants')
      .select('*')
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendants' });
  }
});

// POST /api/attendants
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data, error } = await supabaseAdmin
      .from('attendants')
      .insert({ name, is_active: true })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create attendant' });
  }
});

// PUT /api/attendants/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) {
      updates.is_active = is_active;
      updates.deactivated_at = is_active ? null : new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('attendants')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update attendant' });
  }
});

module.exports = router;