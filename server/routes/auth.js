const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.email);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log('Calling Supabase auth...');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    console.log('Supabase response - error:', error, 'data:', data ? 'exists' : 'null');

    if (error) {
      console.error('Supabase auth error:', error.message);
      return res.status(401).json({ error: error.message });
    }

    console.log('Getting user from users table...');
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role')
      .eq('id', data.user.id)
      .single();

    console.log('User data:', userData, 'User error:', userError);

    if (userError || !userData) {
      return res.status(401).json({ error: 'User not found in system' });
    }

    // Update last login — fire and forget, never block login
    supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.user.id)
      .then(() => {})
      .catch(() => {});

    res.json({
      token: data.session.access_token,
      user: userData
    });

  } catch (err) {
    console.error('Login error caught:', err.message, err.stack);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    await supabase.auth.signOut();
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;