const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/users
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, created_at, last_login')
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { email, name, password, role } = req.body;

    if (!email || !name || !password || !role) {
      return res.status(400).json({ error: 'email, name, password, and role are required' });
    }

    // Manager cannot create admin accounts
    if (req.user.role === 'manager' && role === 'admin') {
      return res.status(403).json({ error: 'Managers cannot create Admin accounts' });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password,
      email_confirm: true,
      user_metadata: { name, role }
    });

    if (authError) return res.status(500).json({ error: authError.message });

    // Update role in users table (trigger creates the row with viewer default)
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ name, role })
      .eq('id', authData.user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { name, role } = req.body;

    // Get target user
    const { data: target } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.params.id)
      .single();

    // Manager cannot touch admin accounts or elevate to admin
    if (req.user.role === 'manager') {
      if (target?.role === 'admin' || role === 'admin') {
        return res.status(403).json({ error: 'Managers cannot modify Admin accounts or assign Admin role' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ name, role })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id — Admin only
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;