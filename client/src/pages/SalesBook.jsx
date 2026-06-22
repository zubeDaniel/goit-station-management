import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function SalesBook() {
  const { showToast } = useToast()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], coupons_ghs:'0', gocard_ghs:'0', momo_ghs:'0', merka_wood_ghs:'0', genset_ghs:'0', lubricant_ghs:'0', meter_amount_ghs:'' })

  useEffect(() => {
    api.get('/sales').then(res => setSales(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const total = ['coupons_ghs','gocard_ghs','momo_ghs','merka_wood_ghs','genset_ghs','lubricant_ghs'].reduce((s,k) => s + (parseFloat(form[k])||0), 0)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/sales', form)
      showToast('success', 'Sales entry saved', form.entry_date)
      const res = await api.get('/sales')
      setSales(res.data)
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="loading-screen">Loading sales book...</div>

  const channels = [
    { key:'coupons_ghs', label:'Coupons' },
    { key:'gocard_ghs', label:'GoCard' },
    { key:'momo_ghs', label:'MoMo' },
    { key:'merka_wood_ghs', label:'Merka Wood' },
    { key:'genset_ghs', label:'Genset' },
    { key:'lubricant_ghs', label:'Lubricant' },
  ]

  return (
    <div>
      <div className="page-header"><div><h2>Sales Book</h2><p>Daily revenue by channel · RTT excluded from all totals</p></div></div>
      <div className="alert alert-info mb-16">
        <div className="alert-body"><div className="alert-title">RTT is excluded from all revenue totals</div><div className="alert-desc">Return to Tank is a stock event only. It has no column here and never appears in any sales figure.</div></div>
      </div>
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
        </div>
        <div className="form-group" style={{ marginBottom:14, maxWidth:220 }}>
          <label className="form-label">Meter amount (GHS)</label>
          <input className="form-input" type="number" value={form.meter_amount_ghs} onChange={e => setForm(p=>({...p,meter_amount_ghs:e.target.value}))} placeholder="From meter book" />
        </div>
        <div style={{ background:'var(--navy-light)', border:'1px solid var(--navy-border)', borderRadius:'var(--r-md)', padding:14, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--navy)' }}>Total sales</span>
          <span className="td-calc" style={{ fontSize:18, fontWeight:700 }}>GHS {total.toFixed(2)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save entry'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Sales history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Coupons</th><th>GoCard</th><th>MoMo</th><th>Merka</th><th>Genset</th><th>Lubricant</th><th>Total</th><th>Variance</th></tr></thead>
            <tbody>
              {sales.slice(0,20).map(s => (
                <tr key={s.id}>
                  <td>{s.entry_date}</td>
                  <td className="td-calc">{parseFloat(s.coupons_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.gocard_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.momo_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.merka_wood_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.genset_ghs).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.lubricant_ghs).toFixed(2)}</td>
                  <td className="td-calc" style={{ fontWeight:700 }}>GHS {parseFloat(s.total_sales_ghs).toFixed(2)}</td>
                  <td><span className={`badge ${parseFloat(s.variance_ghs)>=0?'badge-green':'badge-red'}`}>{parseFloat(s.variance_ghs).toFixed(2)}</span></td>
                </tr>
              ))}
              {sales.length===0 && <tr><td colSpan={9} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}