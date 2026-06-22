const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// GET /api/setup
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('station_setup')
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch setup' });
  }
});

// PUT /api/setup
router.put('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const {
      station_name, dealer_code, location,
      system_start_date, pump_count, tank_count,
      dealer_margin_per_litre, setup_completed
    } = req.body;

    const { data, error } = await supabaseAdmin
      .from('station_setup')
      .update({
        station_name, dealer_code, location,
        system_start_date, pump_count, tank_count,
        dealer_margin_per_litre,
        setup_completed,
        setup_completed_at: setup_completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update setup' });
  }
});

// POST /api/setup/reset/soft — Admin only
router.post('/reset/soft', authenticate, adminOnly, async (req, res) => {
  const { confirmation } = req.body;
  if (confirmation !== 'RESET') {
    return res.status(400).json({ error: 'Type RESET to confirm' });
  }
  try {
    // Clear setup data only — preserve operational data
    // audit_log is NEVER cleared
    await supabaseAdmin.from('station_setup').update({
      setup_completed: false,
      setup_completed_at: null,
      updated_at: new Date().toISOString()
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    await supabaseAdmin.from('fuel_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('attendants').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    res.json({ message: 'Soft reset complete. Operational data preserved. Audit log untouched.' });
  } catch (err) {
    res.status(500).json({ error: 'Soft reset failed' });
  }
});

// POST /api/setup/reset/full — Admin only
router.post('/reset/full', authenticate, adminOnly, async (req, res) => {
  const { confirmation } = req.body;
  if (confirmation !== 'RESET') {
    return res.status(400).json({ error: 'Type RESET to confirm' });
  }
  try {
    // Wipe all operational data — audit_log NEVER cleared
    const tables = [
      'pump_meter_readings', 'tank_stock', 'tanker_deliveries',
      'credit_sales', 'creditor_payments', 'creditors',
      'sales_book', 'banking', 'expenses',
      'compliance_certificates', 'shifts', 'fuel_prices',
      'generated_reports', 'import_log', 'price_update_suggestions',
      'attendants'
    ];

    for (const table of tables) {
      await supabaseAdmin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    await supabaseAdmin.from('station_setup').update({
      setup_completed: false,
      setup_completed_at: null,
      updated_at: new Date().toISOString()
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    res.json({ message: 'Full reset complete. Audit log untouched.' });
  } catch (err) {
    res.status(500).json({ error: 'Full reset failed' });
  }
});

module.exports = router;