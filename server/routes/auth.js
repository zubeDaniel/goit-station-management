const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role')
      .eq('id', data.user.id)
      .single();

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
    // The previous version called supabase.auth.signOut() on the
    // server's shared anon client — that client has no relationship
    // to the specific token the user sent, so it was a no-op: the
    // JWT stayed valid until natural expiry regardless. This actually
    // revokes the session server-side via the Admin API, using the
    // token that was in the Authorization header of this request.
    //
    // Scope 'global' revokes every active session for this account,
    // not just this one device. Chosen deliberately: Viewer/attendant
    // accounts are described in the PRD as used on shared phones, so
    // a stolen or leftover token on a shared device should not survive
    // a teammate's own logout. Trade-off: if the same account is
    // legitimately open on two devices, both get logged out.
    await supabaseAdmin.auth.admin.signOut(req.token, 'global');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ error: 'Logout failed — close your browser to be safe' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;