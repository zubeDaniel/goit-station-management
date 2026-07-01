import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function SalesBook() {
  const { showToast } = useToast()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    coupons_ghs: '0',
    gocard_ghs: '0',
    momo_ghs: '0',
    merka_wood_ghs: '0',
    genset_ghs: '0',
    lubricant_ghs: '0',
    meter_amount_ghs: ''
  })

  const startDate = `${selectedMonth}-01`
  const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
    .toISOString().split('T')[0]

  useEffect(() => {
    loadData()
  }, [selectedMonth])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/sales?start_date=${startDate}&end_date=${endDate}`)
      setSales(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Auto-fill Merka Wood from today's credit sales
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    if (form.entry_date === today) {
      api.get(`/creditors/credit-sales?start_date=${today}&end_date=${today}`)
        .then(res => {
          const total = res.data.reduce((s, cs) => s + parseFloat(cs.total_amount_ghs || 0), 0)
          setForm(p => ({ ...p, merka_wood_ghs: total.toFixed(2) }))
        }).catch(() => {})
    }
  }, [form.entry_date])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/sales', form)
      showToast('success', 'Sales entry saved', form.entry_date)
      await loadData()
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error)
    } finally {
      setSaving(false)
    }
  }

  const channels = [
    { key: 'coupons_ghs', label: 'Coupons' },
    { key: 'gocard_ghs', label: 'GoCard' },
    { key: 'momo_ghs', label: 'MoMo' },
    { key: 'merka_wood_ghs', label: 'Merka Wood', auto: true },
    { key: 'genset_ghs', label: 'Genset' },
    { key: 'lubricant_ghs', label: 'Lubricant' },
  ]

  const total = channels.reduce((s, ch) => s + (parseFloat(form[ch.key]) || 0), 0)
  const variance = total - (parseFloat(form.meter_amount_ghs) || 0)

  // Monthly totals
  const monthlyTotals = channels.reduce((acc, ch) => {
    acc[ch.key] = sales.reduce((s, row) => s + parseFloat(row[ch.key] || 0), 0)
    return acc
  }, {})
  const monthlyTotal = sales.reduce((s, row) => s + parseFloat(row.total_sales_ghs || 0), 0)

  // Available months
  const months = []
  for (let i = 0; i < 6; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().slice(0, 7))
  }

  if (loading) return <div className="loading-screen">Loading sales book...</div>

  return (
    <div>
      <div className="page-header">
        <div><h2>Sales Book</h2><p>Daily revenue by channel · RTT excluded from all totals</p></div>
        <div className="page-header-actions">
          <div style={{ display: 'flex', gap: 4 }}>
            {months.map(m => (
              <button key={m} className={`btn btn-sm ${selectedMonth === m ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedMonth(m)}>
                {new Date(m + '-01').toLocaleString('default', { month: 'short' })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="alert alert-info mb-16">
        <div className="alert-body">
          <div className="alert-title">RTT is excluded from all revenue totals</div>
          <div className="alert-desc">Return to Tank is a stock event only. It never appears in any sales figure.</div>
        </div>
      </div>

      <div className="grid-2 mb-16">
        {/* Daily entry form */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Daily entry — {form.entry_date}</div>
          </div>
          <div className="form-group" style={{ marginBottom: 14, maxWidth: 220 }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.entry_date}
              onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} />
          </div>
          <div className="form-row">
            {channels.map(ch => (
              <div key={ch.key} className="form-group">
                <label className="form-label">{ch.label} (GHS)</label>
                <input
                  className={`form-input ${ch.auto ? 'is-auto' : ''}`}
                  type="number"
                  value={form[ch.key]}
                  onChange={e => !ch.auto && setForm(p => ({ ...p, [ch.key]: e.target.value }))}
                  readOnly={ch.auto}
                />
                {ch.auto && <span className="form-hint">Auto-filled from Creditors</span>}
              </div>
            ))}
          </div>
          <div className="form-group" style={{ marginBottom: 14, maxWidth: 220 }}>
            <label className="form-label">Meter amount (GHS)</label>
            <input className="form-input" type="number" value={form.meter_amount_ghs}
              onChange={e => setForm(p => ({ ...p, meter_amount_ghs: e.target.value }))}
              placeholder="From meter book" />
          </div>

          {/* Totals summary */}
          <div style={{ background: 'var(--navy-light)', border: '1px solid var(--navy-border)', borderRadius: 'var(--r-md)', padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Total sales</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>GHS {total.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Meter amount</div>
                <div className="td-calc" style={{ fontSize: 18, fontWeight: 700 }}>GHS {parseFloat(form.meter_amount_ghs || 0).toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Variance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: variance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {variance >= 0 ? '+' : ''}GHS {variance.toFixed(2)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: variance >= 0 ? 'var(--green-subtle)' : 'var(--red-subtle)', border: `1px solid ${variance >= 0 ? 'var(--green-border)' : 'var(--red-border)'}`, borderRadius: 'var(--r-sm)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: variance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {Math.abs(variance) < 10 ? 'Within tolerance' : variance > 0 ? 'Sales exceed meter — verify' : 'Meter exceeds sales — verify'}
              </span>
            </div>
          </div>

          {/* RTT excluded line */}
          <div style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>RTT (Return to Tank) — stock event, excluded from revenue</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>GHS 0.00</span>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleSave} disabled={saving}>
            <i className="ph ph-floppy-disk"></i> {saving ? 'Saving...' : 'Save sales entry'}
          </button>
        </div>

        {/* Monthly channel totals */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long' })} {new Date(selectedMonth + '-01').getFullYear()} — Channel totals
            </div>
          </div>
          <table>
            <thead><tr><th>Channel</th><th>Month total (GHS)</th><th>%</th></tr></thead>
            <tbody>
              {channels.map(ch => (
                <tr key={ch.key}>
                  <td>{ch.label}</td>
                  <td className="td-calc">{monthlyTotals[ch.key].toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>{monthlyTotal > 0 ? Math.round((monthlyTotals[ch.key] / monthlyTotal) * 100) : 0}%</td>
                </tr>
              ))}
              <tr className="tr-total">
                <td><strong>Grand total</strong></td>
                <td className="td-calc"><strong>{monthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                <td><strong>100%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly history table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long' })} {new Date(selectedMonth + '-01').getFullYear()} — Daily view
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Coupons</th><th>GoCard</th><th>MoMo</th>
                <th>Merka</th><th>Genset</th><th>Lubricant</th>
                <th>Total sales</th><th>Meter amt</th><th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id}>
                  <td>{s.entry_date}</td>
                  <td className="td-calc">{parseFloat(s.coupons_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.gocard_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.momo_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.merka_wood_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.genset_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.lubricant_ghs).toFixed(2)}</td>
                  <td className="td-calc" style={{ fontWeight: 700 }}>GHS {parseFloat(s.total_sales_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.meter_amount_ghs).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${parseFloat(s.variance_ghs) >= 0 ? 'badge-green' : 'badge-red'}`}>
                      {parseFloat(s.variance_ghs) >= 0 ? '+' : ''}{parseFloat(s.variance_ghs).toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>No entries for this month</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}