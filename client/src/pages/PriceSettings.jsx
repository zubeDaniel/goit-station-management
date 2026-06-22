import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function PriceSettings() {
  const { showToast } = useToast()
  const { isAdmin } = useRole()
  const [prices, setPrices] = useState([])
  const [current, setCurrent] = useState({})
  const [setup, setSetup] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ fuel_type:'SXP', price_per_litre:'', effective_date: new Date().toISOString().split('T')[0], npa_reference:'' })
  const [marginForm, setMarginForm] = useState({ dealer_margin_per_litre:'', effective_date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/prices'), api.get('/prices/current'), api.get('/setup'), api.get('/suggestions')])
      .then(([pRes, cRes, sRes, sugRes]) => { setPrices(pRes.data); setCurrent(cRes.data); setSetup(sRes.data); setSuggestions(sugRes.data.filter(s=>s.status==='pending')) })
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSavePrice = async () => {
    setSaving(true)
    try {
      await api.post('/prices', form)
      showToast('success', `${form.fuel_type} price updated`, `GHS ${form.price_per_litre}/L effective ${form.effective_date}`)
      const [pRes, cRes] = await Promise.all([api.get('/prices'), api.get('/prices/current')])
      setPrices(pRes.data); setCurrent(cRes.data)
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  const handleSaveMargin = async () => {
    setSaving(true)
    try {
      await api.put('/setup', { ...setup, dealer_margin_per_litre: marginForm.dealer_margin_per_litre })
      showToast('success', 'Dealer margin updated', `GHS ${marginForm.dealer_margin_per_litre}/L`)
      const res = await api.get('/setup')
      setSetup(res.data)
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  const handleApprove = async (id) => {
    try {
      await api.post(`/suggestions/${id}/approve`)
      showToast('success', 'Price approved', 'Written to fuel_prices')
      setSuggestions(prev => prev.filter(s => s.id !== id))
    } catch (err) { showToast('error', 'Approval failed') }
  }

  const handleReject = async (id) => {
    try {
      await api.post(`/suggestions/${id}/reject`)
      showToast('warning', 'Suggestion rejected')
      setSuggestions(prev => prev.filter(s => s.id !== id))
    } catch (err) { showToast('error', 'Rejection failed') }
  }

  if (loading) return <div className="loading-screen">Loading prices...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Price Settings</h2><p>NPA-regulated pump prices and dealer margin</p></div></div>

      {/* Current prices */}
      <div className="grid-2 mb-16">
        {['SXP','DXP'].map(fuel => (
          <div key={fuel} style={{ background:'var(--navy)', borderRadius:'var(--r-lg)', padding:20, color:'#fff' }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{fuel === 'SXP' ? 'Super XP 91 (SXP)' : 'Diesel XP (DXP)'}</div>
            <div style={{ fontSize:32, fontWeight:700, fontFamily:'var(--font-mono)' }}>GHS {current[fuel] ? parseFloat(current[fuel].price_per_litre).toFixed(4) : '—'}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginTop:4 }}>per litre · effective {current[fuel]?.effective_date || 'not set'}</div>
          </div>
        ))}
      </div>

      {/* Pending AI suggestions — Admin only */}
      {isAdmin && suggestions.length > 0 && (
        <div className="card mb-16" style={{ borderColor:'var(--amber-border)' }}>
          <div className="card-header"><div className="card-title" style={{ color:'var(--amber)' }}>Pending AI price suggestions</div><span className="badge badge-amber">{suggestions.length} pending</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fuel</th><th>Suggested price</th><th>Current price</th><th>Reference</th><th>Action</th></tr></thead>
              <tbody>
                {suggestions.map(s => (
                  <tr key={s.id}>
                    <td>{s.fuel_type}</td>
                    <td className="td-calc" style={{ color:'var(--green)' }}>GHS {parseFloat(s.suggested_price_per_litre).toFixed(4)}</td>
                    <td className="td-calc">GHS {current[s.fuel_type] ? parseFloat(current[s.fuel_type].price_per_litre).toFixed(4) : '—'}</td>
                    <td style={{ fontSize:11 }}>{s.npa_reference}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => handleApprove(s.id)}><i className="ph ph-check"></i> Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReject(s.id)}><i className="ph ph-x"></i> Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Update price form */}
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Update fuel price</div></div>
        <div style={{ background:'var(--amber-subtle)', border:'1px solid var(--amber-border)', borderRadius:'var(--r-sm)', padding:'10px 12px', marginBottom:16, fontSize:12, color:'var(--amber)', display:'flex', alignItems:'center', gap:8 }}>
          <i className="ph ph-warning" style={{ fontSize:16 }}></i>
          GOIL pump prices are regulated by the NPA. Always verify against the latest NPA bulletin before updating.
        </div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Fuel type</label><select className="form-select" value={form.fuel_type} onChange={e => setForm(p=>({...p,fuel_type:e.target.value}))}><option value="SXP">SXP</option><option value="DXP">DXP</option></select></div>
          <div className="form-group"><label className="form-label">New price (GHS/L)</label><input className="form-input" type="number" step="0.0001" value={form.price_per_litre} onChange={e => setForm(p=>({...p,price_per_litre:e.target.value}))} placeholder="0.0000" /></div>
          <div className="form-group"><label className="form-label">Effective date</label><input className="form-input" type="date" value={form.effective_date} onChange={e => setForm(p=>({...p,effective_date:e.target.value}))} /></div>
        </div>
        <div className="form-group" style={{ marginBottom:14 }}>
          <label className="form-label">NPA reference</label>
          <input className="form-input" value={form.npa_reference} onChange={e => setForm(p=>({...p,npa_reference:e.target.value}))} placeholder="NPA Bulletin reference or URL" />
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSavePrice} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Update price'}</button>
        </div>
      </div>

      {/* Dealer margin */}
      <div className="card mb-16" style={{ borderColor:'var(--green-border)' }}>
        <div className="card-header"><div className="card-title" style={{ color:'var(--green)' }}>Dealer margin</div><span className="badge badge-green">Configurable</span></div>
        <div style={{ display:'flex', alignItems:'center', gap:24, marginBottom:14 }}>
          <div style={{ background:'var(--green-subtle)', border:'1px solid var(--green-border)', borderRadius:'var(--r-md)', padding:'14px 20px', textAlign:'center' }}>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--green)', textTransform:'uppercase', marginBottom:4 }}>Current rate</div>
            <div style={{ fontSize:28, fontWeight:700, color:'var(--green)', fontFamily:'var(--font-mono)' }}>GHS {parseFloat(setup?.dealer_margin_per_litre||0.30).toFixed(4)}</div>
            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>per litre dispensed</div>
          </div>
          <div style={{ flex:1, fontSize:12, color:'var(--text-2)', lineHeight:1.6 }}>This rate applies to all fuel types. Daily dealer earnings = total litres dispensed × this rate.</div>
        </div>
        <div className="form-row" style={{ maxWidth:480 }}>
          <div className="form-group"><label className="form-label">New margin (GHS/L)</label><input className="form-input" type="number" step="0.0001" value={marginForm.dealer_margin_per_litre} onChange={e => setMarginForm(p=>({...p,dealer_margin_per_litre:e.target.value}))} placeholder="0.3000" /></div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSaveMargin} disabled={saving}><i className="ph ph-floppy-disk"></i> Update margin</button>
      </div>

      {/* Price history */}
      <div className="card">
        <div className="card-header"><div className="card-title">Price history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Fuel</th><th>Price (GHS/L)</th><th>NPA reference</th></tr></thead>
            <tbody>
              {prices.slice(0,20).map(p => (
                <tr key={p.id}><td>{p.effective_date}</td><td><span className={`badge ${p.fuel_type==='SXP'?'badge-blue':'badge-amber'}`}>{p.fuel_type}</span></td><td className="td-calc">{parseFloat(p.price_per_litre).toFixed(4)}</td><td style={{ fontSize:11, color:'var(--text-3)' }}>{p.npa_reference||'—'}</td></tr>
              ))}
              {prices.length===0 && <tr><td colSpan={4} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No price history yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}