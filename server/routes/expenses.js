const express = require('express');
const router = express.Router();
// Uses req.supabaseAdmin (per-request, actor-attributed) attached by the auth middleware — see middleware/auth.js
const { authenticate, adminOrManager } = require('../middleware/auth');

// GET /api/expenses
router.get('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { start_date, end_date, category } = req.query;
    let query = req.supabaseAdmin
      .from('expenses')
      .select('*')
      .is('deleted_at', null)
      .order('expense_date', { ascending: false });

    if (start_date) query = query.gte('expense_date', start_date);
    if (end_date) query = query.lte('expense_date', end_date);
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST /api/expenses
router.post('/', authenticate, adminOrManager, async (req, res) => {
  try {
    const { expense_date, category, amount_ghs, description, receipt_number } = req.body;

    if (!expense_date || !category || !amount_ghs || !description) {
      return res.status(400).json({ error: 'expense_date, category, amount_ghs, and description are required' });
    }
    if (!Number.isFinite(Number(amount_ghs)) || Number(amount_ghs) <= 0) {
      return res.status(400).json({ error: 'amount_ghs must be a positive number' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('expenses')
      .insert({
        expense_date, category,
        amount_ghs, description,
        receipt_number,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save expense' });
  }
});

// DELETE /api/expenses/:id — soft delete
router.delete('/:id', authenticate, adminOrManager, async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;