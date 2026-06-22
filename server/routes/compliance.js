const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/compliance
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('compliance_certificates')
      .select('*')
      .is('deleted_at', null)
      .order('expiry_date');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
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

    const { data, error } = await supabaseAdmin
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

    const { data, error } = await supabaseAdmin
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
    const { error } = await supabaseAdmin
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