const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/compliance
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('compliance_certificates')
      .select('*')
      .is('deleted_at', null)
      .order('expiry_date');
    if (error) return res.status(500).json({ error: error.message });

    // Derive status from the actual date rather than trusting a stored value
    // that nothing ever recomputes as time passes. 'archived' is an explicit
    // terminal state set by an Admin and is left untouched.
    const today = new Date().toISOString().split('T')[0];
    const withComputedStatus = (data || []).map(cert => {
      if (cert.status === 'archived') return cert;
      const alertDays = cert.alert_days_before || 30;
      const warningThreshold = new Date(cert.expiry_date);
      warningThreshold.setDate(warningThreshold.getDate() - alertDays);
      const warningDateStr = warningThreshold.toISOString().split('T')[0];

      let status = 'valid';
      if (cert.expiry_date < today) status = 'expired';
      else if (warningDateStr <= today) status = 'warning';

      return { ...cert, status };
    });

    res.json(withComputedStatus);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch compliance certificates' });
  }
});

// POST /api/compliance
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      certificate_name, issuing_authority, reference_number,
      issue_date, expiry_date, status, alert_days_before
    } = req.body;

    if (!certificate_name || !issuing_authority || !issue_date || !expiry_date) {
      return res.status(400).json({ error: 'certificate_name, issuing_authority, issue_date, and expiry_date are required' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('compliance_certificates')
      .insert({
        certificate_name, issuing_authority, reference_number,
        issue_date, expiry_date,
        status: status || 'valid',
        alert_days_before: alert_days_before || 30,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create certificate' });
  }
});

// PUT /api/compliance/:id
router.put('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      certificate_name, issuing_authority, reference_number,
      issue_date, expiry_date, status, alert_days_before
    } = req.body;

    // Archiving is Admin-only per the PRD ("Manager: create and
    // update/renew. Cannot delete or archive"). This is the only place
    // that rule could be bypassed, since it's a value inside the general
    // edit payload rather than its own endpoint — the RLS policy on this
    // table now blocks it too (compliance_update_manager), but check it
    // here as well for a clean 403 instead of a raw database error.
    if (req.user.role === 'manager' && status === 'archived') {
      return res.status(403).json({ error: 'Managers cannot archive certificates — Admin only' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('compliance_certificates')
      .update({
        certificate_name, issuing_authority, reference_number,
        issue_date, expiry_date, status, alert_days_before
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update certificate' });
  }
});

// DELETE /api/compliance/:id — Admin only
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('compliance_certificates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Certificate deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete certificate' });
  }
});

module.exports = router;