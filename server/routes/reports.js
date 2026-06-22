const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/reports — list generated reports
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('generated_reports')
      .select('*')
      .order('report_month', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/:month — assemble report data for YYYY-MM
router.get('/:month', authenticate, adminOrManager, async (req, res) => {
  try {
    const { month } = req.params; // e.g. 2026-04
    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString().split('T')[0];

    // Fetch setup for dealer margin
    const { data: setup } = await supabaseAdmin
      .from('station_setup')
      .select('dealer_margin_per_litre, station_name')
      .single();

    const margin = parseFloat(setup?.dealer_margin_per_litre || 0.30);

    // Section 1: Fuel sales
    const { data: meterReadings } = await supabaseAdmin
      .from('pump_meter_readings')
      .select('*')
      .gte('reading_date', startDate)
      .lte('reading_date', endDate);

    // Section 2: Sales book
    const { data: salesBook } = await supabaseAdmin
      .from('sales_book')
      .select('*')
      .gte('entry_date', startDate)
      .lte('entry_date', endDate);

    // Section 3: Banking
    const { data: banking } = await supabaseAdmin
      .from('banking')
      .select('*')
      .gte('entry_date', startDate)
      .lte('entry_date', endDate);

    // Section 4: Credit sales
    const { data: creditSales } = await supabaseAdmin
      .from('credit_sales')
      .select('*, creditors(name)')
      .gte('sale_date', startDate)
      .lte('sale_date', endDate);

    // Section 5: Expenses
    const { data: expenses } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .is('deleted_at', null);

    // Section 6: Tank stock movement
    const { data: tankStock } = await supabaseAdmin
      .from('tank_stock')
      .select('*')
      .gte('stock_date', startDate)
      .lte('stock_date', endDate);

    // Calculate totals
    const totalSxpLitres = (meterReadings || [])
      .filter(r => r.fuel_type === 'SXP')
      .reduce((sum, r) => sum + parseFloat(r.litres_sold || 0), 0);

    const totalDxpLitres = (meterReadings || [])
      .filter(r => r.fuel_type === 'DXP')
      .reduce((sum, r) => sum + parseFloat(r.litres_sold || 0), 0);

    const totalLitres = totalSxpLitres + totalDxpLitres;
    const totalRevenue = (meterReadings || []).reduce((sum, r) => sum + parseFloat(r.amount_ghs || 0), 0);

    // Section 7: Dealer margin
    // Net Dealer Profit formula chain
    const dealerEarnings = totalLitres * margin;
    const totalExpenses = (expenses || []).reduce((sum, e) => sum + parseFloat(e.amount_ghs || 0), 0);
    const netDealerProfit = dealerEarnings - totalExpenses;

    res.json({
      month,
      station_name: setup?.station_name,
      dealer_margin_per_litre: margin,
      section1_fuel_sales: meterReadings || [],
      section2_sales_book: salesBook || [],
      section3_banking: banking || [],
      section4_credit_sales: creditSales || [],
      section5_consolidated: {
        total_revenue: totalRevenue,
        total_sxp_litres: totalSxpLitres,
        total_dxp_litres: totalDxpLitres,
        total_litres: totalLitres,
        dealer_earnings: dealerEarnings,
        total_expenses: totalExpenses,
        net_dealer_profit: netDealerProfit
      },
      section6_stock_movement: tankStock || [],
      section7_dealer_margin: {
        daily: meterReadings || [],
        total_litres: totalLitres,
        margin_per_litre: margin,
        total_earnings: dealerEarnings
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assemble report' });
  }
});

module.exports = router;