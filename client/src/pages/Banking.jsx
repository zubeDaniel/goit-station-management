import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function Banking() {
  const { showToast } = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    nib_ghs: '0',
    umb_momo_ghs: '0',
    gocard_ghs: '0',
    coupons_50_ghs: '0',
    coupons_100_ghs: '0',
    variance_vs_sales: '0'
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
      const res = await api.get(`/banking?start_date=${startDate}&end_date=${endDate}`)
      setEntries(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const channels = [
    { key: 'nib_ghs', label: 'NIB' },
    { key: 'umb_momo_ghs', label: 'UMB / MoMo' },
    { key: 'gocard_ghs', label: 'GoCard' },
    { key: 'coupons_50_ghs', label: 'Coupons @50' },
    { key: 'coupons_100_ghs', label: 'Coupons @100' },
  ]

  const total = channels.reduce((s, ch) => s + (parseFloat(form[ch.key]) || 0), 0)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/banking', { ...form, variance_vs_sales: parseFloat(form.variance_vs_sales) || 0 })
      showToast('success', 'Banking entry saved', form.entry_date)
      await loadData()
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error)
    } finally {
      setSaving(false)
    }
  }

  // Monthly totals
  const monthlyTotals = channels.reduce((acc, ch) => {
    acc[ch.key] = entries.reduce((s, e) => s + parseFloat(e[ch.key] || 0), 0)
    return acc
  }, {})
  const grandTotal = entries.reduce((s, e) => s + parseFloat(e.total_banked_ghs || 0), 0)

  // Available months
  const months = []
  for (let i = 0; i < 6; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().slice(0, 7))
  }

  if (loading) return <div className="loading-screen">Loading banking...</div>

  return (
    <div>
      <div className="page-header">
        <div><h2>Banking</h2><p>Daily payment channel deposits and reconciliation</p></div>
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
                <input className="form-input" type="number" value={form[ch.key]}
                  onChange={e => setForm(p => ({ ...p, [ch.key]: e.target.value }))} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Total banked (GHS)</label>
              <input className="form-input is-calc" value={total.toFixed(2)} readOnly />
            </div>
          </div>

          {/* Variance display */}
          <div style={{ background: 'var(--green-subtle)', border: '1px solid var(--green-border)', borderRadius: 'var(--r-sm)', padding: '10px 12px', textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 2 }}>Total banked</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>GHS {total.toFixed(2)}</div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleSave} disabled={saving}>
            <i className="ph ph-floppy-disk"></i> {saving ? 'Saving...' : 'Save banking entry'}
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
                  <td>{grandTotal > 0 ? Math.round((monthlyTotals[ch.key] / grandTotal) * 100) : 0}%</td>
                </tr>
              ))}
              <tr className="tr-total">
                <td><strong>Grand total</strong></td>
                <td className="td-calc"><strong>{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                <td><strong>100%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* History table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long' })} — Daily view
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>NIB</th><th>MoMo</th><th>GoCard</th><th>Coupons @50</th><th>Coupons @100</th><th>Total banked</th></tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>{e.entry_date}</td>
                  <td className="td-calc">{parseFloat(e.nib_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(e.umb_momo_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(e.gocard_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(e.coupons_50_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(e.coupons_100_ghs).toFixed(2)}</td>
                  <td className="td-calc" style={{ fontWeight: 700 }}>GHS {parseFloat(e.total_banked_ghs).toFixed(2)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>No entries for this month</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}