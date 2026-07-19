const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOnly, adminOrManager } = require('../middleware/auth');

// Helper: get setup row id. Takes the per-request client explicitly —
// this is a module-level function, not a route handler, so it has no
// access to `req` at all. (This was the actual bug behind "req is not
// defined": the earlier version referenced req.supabaseAdmin directly
// from this scope, which doesn't exist here — a ReferenceError at
// runtime that node --check's syntax-only validation can't catch, since
// req.supabaseAdmin is syntactically valid regardless of whether req
// exists in scope.)
const getSetupId = async (supabaseAdmin) => {
  const { data, error } = await supabaseAdmin
    .from('station_setup')
    .select('id')
    .single();
  if (error || !data) throw new Error('Station setup not found');
  return data.id;
};

// GET /api/setup
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
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

    const id = await getSetupId(req.supabaseAdmin);

    const updates = {};
    if (station_name !== undefined) updates.station_name = station_name;
    if (dealer_code !== undefined) updates.dealer_code = dealer_code;
    if (location !== undefined) updates.location = location;
    if (system_start_date !== undefined) updates.system_start_date = system_start_date;
    if (pump_count !== undefined) updates.pump_count = pump_count;
    if (tank_count !== undefined) updates.tank_count = tank_count;
    if (dealer_margin_per_litre !== undefined) updates.dealer_margin_per_litre = dealer_margin_per_litre;
    if (setup_completed !== undefined) {
      updates.setup_completed = setup_completed;
      updates.setup_completed_at = setup_completed ? new Date().toISOString() : null;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await req.supabaseAdmin
      .from('station_setup')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('Setup update error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update setup' });
  }
});

// POST /api/setup/reset/soft — Admin only
router.post('/reset/soft', authenticate, adminOnly, async (req, res) => {
  const { confirmation } = req.body;
  if (confirmation !== 'RESET') {
    return res.status(400).json({ error: 'Type RESET to confirm' });
  }
  try {
    const id = await getSetupId(req.supabaseAdmin);

    // Clear setup data only — preserve operational data
    // audit_log is NEVER cleared
    const failures = [];

    const { error: setupErr } = await req.supabaseAdmin
      .from('station_setup')
      .update({
        setup_completed: false,
        setup_completed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (setupErr) failures.push(`station_setup: ${setupErr.message}`);

    const { error: pricesErr } = await req.supabaseAdmin
      .from('fuel_prices')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (pricesErr) failures.push(`fuel_prices: ${pricesErr.message}`);

    const { error: attendantsErr } = await req.supabaseAdmin
      .from('attendants')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (attendantsErr) failures.push(`attendants: ${attendantsErr.message}`);

    if (failures.length > 0) {
      console.error('Soft reset partial failure:', failures);
      return res.status(500).json({ error: 'Soft reset partially failed', details: failures });
    }

    res.json({ message: 'Soft reset complete. Operational data preserved. Audit log untouched.' });
  } catch (err) {
    console.error('Soft reset error:', err.message);
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
    // Wipe all operational data in correct order (FK dependencies)
    // audit_log is NEVER cleared
    const tables = [
      'shifts',
      'pump_meter_readings',
      'tank_stock',
      'tanker_deliveries',
      'credit_sales',
      'creditor_payments',
      'creditors',
      'sales_book',
      'banking',
      'expenses',
      'compliance_certificates',
      'fuel_prices',
      'generated_reports',
      'import_log',
      'price_update_suggestions',
      'attendants',
    ];
    const failures = [];

    for (const table of tables) {
      const { error: delErr } = await req.supabaseAdmin
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) failures.push(`${table}: ${delErr.message}`);
    }

    const id = await getSetupId(req.supabaseAdmin);
    const { error: setupErr } = await req.supabaseAdmin
      .from('station_setup')
      .update({
        setup_completed: false,
        setup_completed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (setupErr) failures.push(`station_setup: ${setupErr.message}`);

    if (failures.length > 0) {
      console.error('Full reset partial failure:', failures);
      return res.status(500).json({ error: 'Full reset partially failed', details: failures });
    }

    res.json({ message: 'Full reset complete. Audit log untouched.' });
  } catch (err) {
    console.error('Full reset error:', err.message);
    res.status(500).json({ error: 'Full reset failed' });
  }
});

module.exports = router;