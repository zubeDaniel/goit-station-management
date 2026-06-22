import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function Creditors() {
  const { showToast } = useToast()
  const [creditors, setCreditors] = useState([])
  const [creditSales, setCreditSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ sale_date: new Date().toISOString().split('T')[0], creditor_id:'', sxp_litres:'0', dxp_litres:'', sxp_amount_ghs:'0', dxp_amount_ghs:'' })
  const [prices, setPrices] = useState({})

  useEffect(() => {
    Promise.all([api.get('/creditors'), api.get('/creditors/credit-sales'), api.get('/prices/current')])
      .then(([cRes, csRes, pRes]) => { setCreditors(cRes.data); setCreditSales(csRes.data); setPrices(pRes.data) })
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/creditors/credit-sales', form)
      showToast('success', 'Credit sale saved', form.sale_date)
      const res = await api.get('/creditors/credit-sales')
      setCreditSales(res.data)
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="loading-screen">Loading creditors...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Creditors</h2><p>Credit sales and payment tracking</p></div></div>
      {creditors.map(c => (
        <div key={c.id} className="card mb-16">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <div><div style={{ fontSize:15, fontWeight:600, color:'var(--navy)' }}>{c.name}</div><div style={{ fontSize:12, color:'var(--text-3)' }}>{c.contact_name} · {c.contact_phone}</div></div>
            <span className={`badge ${parseFloat(c.current_balance_ghs)>0?'badge-amber':'badge-green'}`}>Balance: GHS {parseFloat(c.current_balance_ghs).toLocaleString()}</span>
          </div>
          <div className="grid-3">
            <div style={{ textAlign:'center', padding:12, background:'var(--red-subtle)', border:'1px solid var(--red-border)', borderRadius:'var(--r-md)' }}><div style={{ fontSize:10, color:'var(--red)', textTransform:'uppercase', marginBottom:4 }}>Balance owed</div><div style={{ fontSize:20, fontWeight:700, color:'var(--red)', fontFamily:'var(--font-mono)' }}>GHS {parseFloat(c.current_balance_ghs).toLocaleString()}</div></div>
            <div style={{ textAlign:'center', padding:12, background:'var(--navy-light)', border:'1px solid var(--navy-border)', borderRadius:'var(--r-md)' }}><div style={{ fontSize:10, color:'var(--navy)', textTransform:'uppercase', marginBottom:4 }}>Credit limit</div><div style={{ fontSize:20, fontWeight:700, color:'var(--navy)', fontFamily:'var(--font-mono)' }}>GHS {parseFloat(c.credit_limit_ghs).toLocaleString()}</div></div>
            <div style={{ textAlign:'center', padding:12, background:'var(--green-subtle)', border:'1px solid var(--green-border)', borderRadius:'var(--r-md)' }}><div style={{ fontSize:10, color:'var(--green)', textTransform:'uppercase', marginBottom:4 }}>Available</div><div style={{ fontSize:20, fontWeight:700, color:'var(--green)', fontFamily:'var(--font-mono)' }}>GHS {(parseFloat(c.credit_limit_ghs)-parseFloat(c.current_balance_ghs)).toLocaleString()}</div></div>
          </div>
        </div>
      ))}
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">New credit sale</div></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={form.sale_date} onChange={e => setForm(p=>({...p,sale_date:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Creditor</label><select className="form-select" value={form.creditor_id} onChange={e => setForm(p=>({...p,creditor_id:e.target.value}))}><option value="">Select creditor</option>{creditors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">DXP litres</label><input className="form-input" type="number" value={form.dxp_litres} onChange={e => { const l=e.target.value; const a=(parseFloat(l)||0)*(parseFloat(prices.DXP?.price_per_litre)||0); setForm(p=>({...p,dxp_litres:l,dxp_amount_ghs:a.toFixed(2)})) }} /></div>
          <div className="form-group"><label className="form-label">DXP amount (GHS)</label><input className="form-input is-calc" value={form.dxp_amount_ghs} readOnly /></div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save credit sale'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Credit sales history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Creditor</th><th>DXP (L)</th><th>DXP amt</th><th>Total</th></tr></thead>
            <tbody>
              {creditSales.slice(0,20).map(s => (
                <tr key={s.id}><td>{s.sale_date}</td><td>{s.creditors?.name}</td><td className="td-calc">{parseFloat(s.dxp_litres).toFixed(2)}</td><td className="td-calc">GHS {parseFloat(s.dxp_amount_ghs).toFixed(2)}</td><td className="td-calc">GHS {parseFloat(s.total_amount_ghs).toFixed(2)}</td></tr>
              ))}
              {creditSales.length===0 && <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No credit sales yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}