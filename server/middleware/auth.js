const { supabase, supabaseAdmin, createActorClient } = require('../config/supabase');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({ error: 'User not found in system' });
    }

    req.user = userData;
    req.token = token;
    // Per-request client carrying x-actor-id so audit_log_trigger()
    // can correctly attribute UPDATE/DELETE to the person actually
    // making the change, not the row's original creator. Routes
    // should use req.supabaseAdmin instead of the shared module-level
    // client for any write.
    req.supabaseAdmin = createActorClient(userData.id);
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    next();
  };
};

const adminOnly = requireRole('admin');
const adminOrManager = requireRole('admin', 'manager');
const allRoles = requireRole('admin', 'manager', 'viewer');

module.exports = { authenticate, requireRole, adminOnly, adminOrManager, allRoles };