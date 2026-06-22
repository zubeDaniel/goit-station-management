import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function Banking() {
  const { showToast } = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], nib_ghs:'0', umb_momo_ghs:'0', gocard_ghs:'0', coupons_50_ghs:'0', coupons_100_ghs:'0', variance_vs_sales:'0' })

  useEffect(() => {
    api.get('/banking').then(res => setEntries(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const total = ['nib_ghs','umb_momo_ghs','gocard_ghs','coupons_50_ghs','coupons_100_ghs'].reduce((s,k) => s+(parseFloat(form[k])||0), 0)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/banking', { ...form, variance_vs_sales: parseFloat(form.variance_vs_sales)||0 })
      showToast('success', 'Banking entry saved', form.entry_date)
      const res = await api.get('/banking')
      setEntries(res.data)
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="loading-screen">Loading banking...</div>

  const channels = [
    { key:'nib_ghs', label:'NIB' },
    { key:'umb_momo_ghs', label:'UMB / MoMo' },
    { key:'gocard_ghs', label:'GoCard' },
    { key:'coupons_50_ghs', label:'Coupons @50' },
    { key:'coupons_100_ghs', label:'Coupons @100' },
  ]

  return (
    <div>
      <div className="page-header"><div><h2>Banking</h2><p>Daily payment channel deposits and reconciliation</p></div></div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Daily entry — {form.entry_date}</div></div>
        <div className="form-group" style={{ marginBottom:14, maxWidth:220 }}>
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.entry_date} onChange={e => setForm(p=>({...p,entry_date:e.target.value}))} />
        </div>
        <div className="form-row">
          {channels.map(ch => (
            <div key={ch.key} className="form-group">
              <label className="form-label">{ch.label} (GHS)</label>
              <input className="form-input" type="number" value={form[ch.key]} onChange={e => setForm(p=>({...p,[ch.key]:e.target.value}))} />
            </div>
          ))}
          <div className="form-group">
            <label className="form-label">Total banked (GHS)</label>
            <input className="form-input is-calc" value={total.toFixed(2)} readOnly />
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save entry'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Banking history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>NIB</th><th>MoMo</th><th>GoCard</th><th>Coupons @50</th><th>Coupons @100</th><th>Total banked</th></tr></thead>
            <tbody>
              {entries.slice(0,20).map(e => (
                <tr key={e.id}><td>{e.entry_date}</td><td className="td-calc">{parseFloat(e.nib_ghs).toFixed(2)}</td><td className="td-calc">{parseFloat(e.umb_momo_ghs).toFixed(2)}</td><td className="td-calc">{parseFloat(e.gocard_ghs).toFixed(2)}</td><td className="td-calc">{parseFloat(e.coupons_50_ghs).toFixed(2)}</td><td className="td-calc">{parseFloat(e.coupons_100_ghs).toFixed(2)}</td><td className="td-calc" style={{ fontWeight:700 }}>GHS {parseFloat(e.total_banked_ghs).toFixed(2)}</td></tr>
              ))}
              {entries.length===0 && <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}