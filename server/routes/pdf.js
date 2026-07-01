const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/pdf/:month — returns report data for client-side PDF generation
router.get('/:month', authenticate, adminOrManager, async (req, res) => {
  try {
    const { month } = req.params;
    const startDate = `${month}-01`;
    const endDate = new Date(
      new Date(startDate).getFullYear(),
      new Date(startDate).getMonth() + 1, 0
    ).toISOString().split('T')[0];

    const { data: setup } = await supabaseAdmin
      .from('station_setup').select('*').single();

    const margin = parseFloat(setup?.dealer_margin_per_litre || 0.30);

    const [meterRes, salesRes, bankingRes, creditRes, expensesRes, tankRes] = await Promise.all([
      supabaseAdmin.from('pump_meter_readings').select('*').gte('reading_date', startDate).lte('reading_date', endDate),
      supabaseAdmin.from('sales_book').select('*').gte('entry_date', startDate).lte('entry_date', endDate),
      supabaseAdmin.from('banking').select('*').gte('entry_date', startDate).lte('entry_date', endDate),
      supabaseAdmin.from('credit_sales').select('*').gte('sale_date', startDate).lte('sale_date', endDate),
      supabaseAdmin.from('expenses').select('*').gte('expense_date', startDate).lte('expense_date', endDate).is('deleted_at', null),
      supabaseAdmin.from('tank_stock').select('*').gte('stock_date', startDate).lte('stock_date', endDate),
    ]);

    res.json({
      setup,
      margin,
      month,
      meter: meterRes.data || [],
      sales: salesRes.data || [],
      banking: bankingRes.data || [],
      credits: creditRes.data || [],
      expenses: expensesRes.data || [],
      tanks: tankRes.data || [],
    });
  } catch (err) {
    console.error('PDF data error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;