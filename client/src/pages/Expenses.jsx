import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function Expenses() {
  const { showToast } = useToast()
  const [expenses, setExpenses] = useState([])
  const [setup, setSetup] = useState(null)
  const [meterReadings, setMeterReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: 'Salaries',
    amount_ghs: '',
    description: '',
    receipt_number: ''
  })

  const currentMonth = new Date().toISOString().slice(0, 7)
  const startDate = `${currentMonth}-01`
  const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
    .toISOString().split('T')[0]

  useEffect(() => {
    Promise.all([
      api.get(`/expenses?start_date=${startDate}&end_date=${endDate}`),
      api.get('/setup'),
      api.get(`/meter?start_date=${startDate}&end_date=${endDate}`)
    ]).then(([expRes, setupRes, meterRes]) => {
      setExpenses(expRes.data)
      setSetup(setupRes.data)
      setMeterReadings(meterRes.data)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/expenses', form)
      showToast('success', 'Expense saved', form.description)
      const res = await api.get(`/expenses?start_date=${startDate}&end_date=${endDate}`)
      setExpenses(res.data)
      setForm(p => ({ ...p, amount_ghs: '', description: '', receipt_number: '' }))
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error)
    } finally {
      setSaving(false)
    }
  }

  // Correct formula chain per PRD
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount_ghs || 0), 0)
  const totalLitres = meterReadings.reduce((s, r) => s + parseFloat(r.litres_sold || 0), 0)
  const margin = parseFloat(setup?.dealer_margin_per_litre || 0.30)
  const dealerEarnings = totalLitres * margin
  const netDealerProfit = dealerEarnings - totalExpenses

  // Category breakdown
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount_ghs || 0)
    return acc
  }, {})

  const largestCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]

  if (loading) return <div className="loading-screen">Loading expenses...</div>

  const categories = ['Salaries', 'Maintenance', 'Utilities', 'Supplies', 'Transport', 'Other']

  return (
    <div>
      <div className="page-header">
        <div><h2>Expenses</h2><p>Operational cost tracking for profitability analysis</p></div>
      </div>

      {/* KPI cards — correct formula chain */}
      <div className="kpi-grid mb-16">
        <div className="kpi-card kpi-red">
          <div className="kpi-label">Total expenses</div>
          <div className="kpi-value">GHS {totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="kpi-sub">{new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}</div>
        </div>
        <div className="kpi-card kpi-green">
          <div className="kpi-label">Dealer earnings</div>
          <div className="kpi-value">GHS {dealerEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="kpi-sub">GHS {margin.toFixed(2)}/L × {totalLitres.toFixed(2)} L</div>
        </div>
        <div className="kpi-card kpi-green">
          <div className="kpi-label">Net Dealer Profit ★</div>
          <div className="kpi-value" style={{ color: netDealerProfit < 0 ? 'var(--red)' : 'var(--navy)' }}>
            GHS {netDealerProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className={`kpi-sub ${netDealerProfit < 0 ? 'negative' : 'positive'}`}>
            Dealer earnings GHS {dealerEarnings.toFixed(2)} − Expenses GHS {totalExpenses.toFixed(2)}
          </div>
          {netDealerProfit < 0 && (
            <div className="kpi-sub negative">Expenses exceed dealer earnings this period</div>
          )}
        </div>
        <div className="kpi-card kpi-amber">
          <div className="kpi-label">Largest category</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{largestCategory?.[0] || '—'}</div>
          <div className="kpi-sub warning">
            {largestCategory ? `GHS ${largestCategory[1].toLocaleString()} (${Math.round(largestCategory[1] / totalExpenses * 100)}%)` : 'No data'}
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Log expense form */}
        <div className="card">
          <div className="card-header"><div className="card-title">Log new expense</div></div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={form.expense_date}
                onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (GHS)</label>
              <input className="form-input" type="number" value={form.amount_ghs}
                onChange={e => setForm(p => ({ ...p, amount_ghs: e.target.value }))}
                placeholder="0.00" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {categories.map(cat => (
                <span key={cat}
                  onClick={() => setForm(p => ({ ...p, category: cat }))}
                  style={{
                    padding: '5px 12px',
                    border: `1px solid ${form.category === cat ? 'var(--navy)' : 'var(--border)'}`,
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: form.category === cat ? 500 : 400,
                    color: form.category === cat ? '#fff' : 'var(--text-2)',
                    background: form.category === cat ? 'var(--navy)' : 'var(--surface)',
                    cursor: 'pointer',
                    transition: 'all 0.12s'
                  }}>
                  {cat}
                </span>
              ))}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description" />
            </div>
            <div className="form-group">
              <label className="form-label">Receipt no.</label>
              <input className="form-input" value={form.receipt_number}
                onChange={e => setForm(p => ({ ...p, receipt_number: e.target.value }))}
                placeholder="Optional" />
            </div>
          </div>
          <button className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            onClick={handleSave} disabled={saving}>
            <i className="ph ph-floppy-disk"></i> {saving ? 'Saving...' : 'Save expense'}
          </button>
        </div>

        {/* Category breakdown */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()} — Category breakdown
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Category</th><th>Total (GHS)</th><th>%</th></tr>
            </thead>
            <tbody>
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td className="td-calc">{amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>{totalExpenses > 0 ? Math.round(amt / totalExpenses * 100) : 0}%</td>
                </tr>
              ))}
              {Object.keys(byCategory).length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>No expenses this month</td></tr>
              )}
              {Object.keys(byCategory).length > 0 && (
                <tr className="tr-total">
                  <td><strong>Total</strong></td>
                  <td className="td-calc"><strong>{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                  <td><strong>100%</strong></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense history */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><div className="card-title">Expense history</div></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (GHS)</th><th>Receipt</th></tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td>{e.expense_date}</td>
                  <td><span className="badge badge-neutral">{e.category}</span></td>
                  <td>{e.description}</td>
                  <td className="td-calc">{parseFloat(e.amount_ghs).toFixed(2)}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.receipt_number || '—'}</td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>No expenses yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}