const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager } = require('../middleware/auth');

// ── Report assembly — single source of truth ─────────────────────
// Previously this logic existed in three places: this file (Section 5
// only, Section 6 passed through raw), server/routes/pdf.js (a parallel
// route that re-ran the same 6 queries and did zero computation), and
// client/src/pages/Reports.jsx (which computed the Section 6 stock-
// movement rollup itself, twice — once for the in-app screen, once again
// for the PDF export, same formula copy-pasted). pdf.js has been retired;
// the PDF export now calls this same GET /:month endpoint the in-app
// screen already used. One formula, one place.

function monthDateRange(month) {
  const startDate = `${month}-01`;
  const endDate = new Date(
    new Date(startDate).getFullYear(),
    new Date(startDate).getMonth() + 1, 0
  ).toISOString().split('T')[0];
  return { startDate, endDate };
}

function previousMonthKey(month) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7); // YYYY-MM
}

// Section 6 rollup: opening + received − sold = expected closing, vs the
// actual last dip. Moved here from Reports.jsx, where it was written
// twice with no backend version at all — see note above.
function summarizeStockMovement(tankStock) {
  const rollupTank = (tankId) => {
    const rows = tankStock.filter(t => t.tank_id === tankId);
    const opening = rows.length > 0 ? parseFloat(rows[0].opening_stock) : 0;
    const received = rows.reduce((s, t) => s + parseFloat(t.delivery_litres || 0), 0);
    const sold = rows.reduce((s, t) => s + parseFloat(t.litres_sold || 0), 0);
    const closing = rows.length > 0 ? parseFloat(rows[rows.length - 1].closing_stock_dip) : 0;
    const variance = closing - (opening + received - sold);
    return { opening, received, sold, closing, variance };
  };

  const sxp = rollupTank('TANK_A');
  const dxp = rollupTank('TANK_B');
  const combined = {
    opening: sxp.opening + dxp.opening,
    received: sxp.received + dxp.received,
    sold: sxp.sold + dxp.sold,
    closing: sxp.closing + dxp.closing,
    variance: sxp.variance + dxp.variance,
  };
  return { sxp, dxp, combined };
}

// Fetches and computes everything needed to render one month's report.
// Called twice per request to GET /:month — once for the requested month,
// once for the previous month (month-over-month comparison). Both calls
// hit the same 6 tables live; nothing is read from generated_reports,
// because nothing in this codebase currently writes to it — see PRD open
// items / conversation history. Live re-computation is correct and cheap
// at this station's data volume (one station, a handful of report loads
// a month). Revisit if generated_reports.snapshot_json ever gets a write
// path and this becomes worth caching.
async function assembleReport(supabaseAdmin, month) {
  const { startDate, endDate } = monthDateRange(month);

  const { data: setup } = await supabaseAdmin
    .from('station_setup')
    .select('*')
    .single();

  const margin = parseFloat(setup?.dealer_margin_per_litre || 0.30);

  const [
    meterRes, salesRes, bankingRes,
    creditRes, expensesRes, tankRes
  ] = await Promise.all([
    supabaseAdmin.from('pump_meter_readings').select('*').gte('reading_date', startDate).lte('reading_date', endDate),
    supabaseAdmin.from('sales_book').select('*').gte('entry_date', startDate).lte('entry_date', endDate),
    supabaseAdmin.from('banking').select('*').gte('entry_date', startDate).lte('entry_date', endDate),
    supabaseAdmin.from('credit_sales').select('*, creditors(name)').gte('sale_date', startDate).lte('sale_date', endDate),
    supabaseAdmin.from('expenses').select('*').gte('expense_date', startDate).lte('expense_date', endDate).is('deleted_at', null),
    supabaseAdmin.from('tank_stock').select('*').gte('stock_date', startDate).lte('stock_date', endDate),
  ]);

  const meterReadings = meterRes.data || [];
  const salesBook = salesRes.data || [];
  const banking = bankingRes.data || [];
  const creditSales = creditRes.data || [];
  const expenses = expensesRes.data || [];
  const tankStock = tankRes.data || [];

  const totalSxpLitres = meterReadings.filter(r => r.fuel_type === 'SXP').reduce((s, r) => s + parseFloat(r.litres_sold || 0), 0);
  const totalDxpLitres = meterReadings.filter(r => r.fuel_type === 'DXP').reduce((s, r) => s + parseFloat(r.litres_sold || 0), 0);
  const totalLitres = totalSxpLitres + totalDxpLitres;
  const totalRevenue = salesBook.reduce((s, r) => s + parseFloat(r.total_sales_ghs || 0), 0);
  const dealerEarnings = totalLitres * margin;
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount_ghs || 0), 0);
  const netDealerProfit = dealerEarnings - totalExpenses;
  // Previously only computed client-side inside handleExportPDF — moved
  // here so Section 5 is the one place total_banked/total_credit live,
  // instead of being re-derived wherever a KPI needs them.
  const totalBanked = banking.reduce((s, b) => s + parseFloat(b.total_banked_ghs || 0), 0);
  const totalCredit = creditSales.reduce((s, c) => s + parseFloat(c.total_amount_ghs || 0), 0);

  const hasData = meterReadings.length > 0 || salesBook.length > 0 || banking.length > 0 ||
                  creditSales.length > 0 || expenses.length > 0 || tankStock.length > 0;

  return {
    month,
    has_data: hasData,
    setup: setup || null,
    station_name: setup?.station_name,
    dealer_margin_per_litre: margin,
    section1_fuel_sales: meterReadings,
    section2_sales_book: salesBook,
    section3_banking: banking,
    section4_credit_sales: creditSales,
    section5_consolidated: {
      total_revenue: totalRevenue,
      total_sxp_litres: totalSxpLitres,
      total_dxp_litres: totalDxpLitres,
      total_litres: totalLitres,
      dealer_earnings: dealerEarnings,
      total_expenses: totalExpenses,
      net_dealer_profit: netDealerProfit,
      total_banked: totalBanked,
      total_credit: totalCredit,
    },
    section6_stock_movement: tankStock,
    section6_summary: summarizeStockMovement(tankStock),
    section7_dealer_margin: {
      daily: meterReadings,
      total_litres: totalLitres,
      margin_per_litre: margin,
      total_earnings: dealerEarnings,
    },
  };
}

// GET /api/reports
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('generated_reports')
      .select('*')
      .order('report_month', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/:month
// Serves both the in-app Reports screen and the PDF export (Reports.jsx
// no longer calls a separate /pdf/:month — that route re-ran identical
// queries and computed nothing; retired). Includes a trimmed
// previous_month block for month-over-month deltas — live re-query, not
// a stored snapshot (see assembleReport comment above for why).
router.get('/:month', authenticate, adminOrManager, async (req, res) => {
  try {
    const { month } = req.params;
    const prevMonth = previousMonthKey(month);

    const [current, previous] = await Promise.all([
      assembleReport(req.supabaseAdmin, month),
      assembleReport(req.supabaseAdmin, prevMonth),
    ]);

    res.json({
      ...current,
      previous_month: {
        month: prevMonth,
        has_data: previous.has_data,
        section5_consolidated: previous.section5_consolidated,
      },
    });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to assemble report' });
  }
});

module.exports = router;