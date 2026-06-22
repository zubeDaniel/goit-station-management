import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function MeterBook() {
  const { showToast } = useToast()
  const { isAdminOrManager } = useRole()
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [prices, setPrices] = useState({})
  const [attendants, setAttendants] = useState([])
  const [form, setForm] = useState({
    reading_date: new Date().toISOString().split('T')[0],
    delivery: false,
    P1_SXP: { opening_meter: '', closing_meter: '', attendant_id: '', rtt_litres: '' },
    P1_DXP: { opening_meter: '', closing_meter: '', attendant_id: '', rtt_litres: '' },
    P2_SXP: { opening_meter: '', closing_meter: '', attendant_id: '', rtt_litres: '' },
    P2_DXP: { opening_meter: '', closing_meter: '', attendant_id: '', rtt_litres: '' },
    P3_DXP: { opening_meter: '', closing_meter: '', attendant_id: '', rtt_litres: '' },
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/meter'),
      api.get('/prices/current'),
      api.get('/attendants')
    ]).then(([meterRes, pricesRes, attendantsRes]) => {
      setReadings(meterRes.data)
      setPrices(pricesRes.data)
      setAttendants(attendantsRes.data)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  const calcLitres = (opening, closing) => {
    const diff = parseFloat(closing) - parseFloat(opening)
    return isNaN(diff) || diff < 0 ? 0 : diff
  }

  const calcAmount = (litres, fuelType) => {
    const price = parseFloat(prices[fuelType]?.price_per_litre || 0)
    return (litres * price).toFixed(2)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const pumps = [
        { pump_id: 'P1', fuel_type: 'SXP', ...form.P1_SXP },
        { pump_id: 'P1', fuel_type: 'DXP', ...form.P1_DXP },
        { pump_id: 'P2', fuel_type: 'SXP', ...form.P2_SXP },
        { pump_id: 'P2', fuel_type: 'DXP', ...form.P2_DXP },
        { pump_id: 'P3', fuel_type: 'DXP', ...form.P3_DXP },
      ]

      for (const pump of pumps) {
        if (!pump.closing_meter) continue
        const litres = calcLitres(pump.opening_meter, pump.closing_meter)
        const amount = calcAmount(litres, pump.fuel_type)
        await api.post('/meter', {
          reading_date: form.reading_date,
          pump_id: pump.pump_id,
          fuel_type: pump.fuel_type,
          attendant_id: pump.attendant_id || null,
          opening_meter: parseFloat(pump.opening_meter) || 0,
          closing_meter: parseFloat(pump.closing_meter),
          amount_ghs: parseFloat(amount),
          rtt_litres: parseFloat(pump.rtt_litres) || 0
        })
      }

      showToast('success', 'Meter entry saved', form.reading_date)
      const res = await api.get('/meter')
      setReadings(res.data)
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error || 'Check your connection')
    } finally {
      setSaving(false)
    }
  }

  const updatePump = (key, field, value) => {
    setForm(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const pumpConfigs = [
    { key: 'P1_SXP', label: 'Pump 1', fuel: 'SXP', color: 'var(--navy)' },
    { key: 'P1_DXP', label: 'Pump 1', fuel: 'DXP', color: 'var(--amber)' },
    { key: 'P2_SXP', label: 'Pump 2', fuel: 'SXP', color: 'var(--navy)' },
    { key: 'P2_DXP', label: 'Pump 2', fuel: 'DXP', color: 'var(--amber)' },
    { key: 'P3_DXP', label: 'Pump 3', fuel: 'DXP', color: 'var(--amber)' },
  ]

  const totalSXP = ['P1_SXP','P2_SXP'].reduce((sum, k) => sum + calcLitres(form[k].opening_meter, form[k].closing_meter), 0)
  const totalDXP = ['P1_DXP','P2_DXP','P3_DXP'].reduce((sum, k) => sum + calcLitres(form[k].opening_meter, form[k].closing_meter), 0)
  const totalLitres = totalSXP + totalDXP
  const dealerMargin = 0.30
  const dealerEarnings = totalLitres * dealerMargin

  if (loading) return <div className="loading-screen">Loading meter book...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Meter Book</h2>
          <p>Per-pump daily readings · P1 (SXP+DXP) · P2 (SXP+DXP) · P3 (DXP only)</p>
        </div>
      </div>

      {isAdminOrManager && (
        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title">Daily entry — {form.reading_date}</div>
          </div>

          <div style={{ maxWidth:220, marginBottom:14 }}>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={form.reading_date}
                onChange={e => setForm(prev => ({ ...prev, reading_date: e.target.value }))} />
            </div>
          </div>

          {pumpConfigs.map(({ key, label, fuel, color }) => {
            const data = form[key]
            const litres = calcLitres(data.opening_meter, data.closing_meter)
            const amount = calcAmount(litres, fuel)
            return (
              <div key={key} style={{ border:'1px solid var(--border)', borderRadius:'var(--r-md)', overflow:'hidden', marginBottom:12 }}>
                <div style={{ background:'var(--surface-2)', padding:'10px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}>
                  <span style={{ background:'var(--navy)', color:'#fff', padding:'2px 9px', borderRadius:4, fontSize:11, fontWeight:700 }}>{label.replace('Pump ','P')}</span>
                  <span style={{ fontSize:13, fontWeight:500, color:'var(--navy)' }}>{label} — {fuel}</span>
                  <div style={{ width:8, height:8, background:color, borderRadius:'50%', marginLeft:'auto' }}></div>
                </div>
                <div style={{ padding:14 }}>
                  <div className="form-row-4" style={{ marginBottom:8 }}>
                    <div className="form-group">
                      <label className="form-label">Opening meter</label>
                      <input className="form-input is-auto" value={data.opening_meter} readOnly />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Closing meter</label>
                      <input className="form-input" type="number" value={data.closing_meter}
                        onChange={e => updatePump(key, 'closing_meter', e.target.value)} placeholder="Enter reading" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Litres sold</label>
                      <input className="form-input is-calc" value={litres.toFixed(2)} readOnly />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (GHS)</label>
                      <input className="form-input is-calc" value={amount} readOnly />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:14 }}>
                    <div className="form-group" style={{ flex:1, maxWidth:200 }}>
                      <label className="form-label">Attendant</label>
                      <select className="form-select" value={data.attendant_id}
                        onChange={e => updatePump(key, 'attendant_id', e.target.value)}>
                        <option value="">Select attendant</option>
                        {attendants.filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex:1, maxWidth:200 }}>
                      <label className="form-label" style={{ color:'var(--amber)' }}>RTT litres (optional)</label>
                      <input className="form-input" type="number" placeholder="0.00"
                        style={{ borderColor:'var(--amber-border)' }}
                        value={data.rtt_litres}
                        onChange={e => updatePump(key, 'rtt_litres', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Totals band */}
          <div style={{ background:'var(--navy-light)', border:'1px solid var(--navy-border)', borderRadius:'var(--r-md)', padding:'14px 16px', marginTop:12 }}>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--navy)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:12 }}>Daily totals — auto-calculated</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
              {[
                { label:'Total SXP', value:`${totalSXP.toFixed(2)} L`, calc:true },
                { label:'Total DXP', value:`${totalDXP.toFixed(2)} L`, calc:true },
                { label:'Total litres', value:`${totalLitres.toFixed(2)} L`, calc:false },
                { label:'SXP revenue', value:`GHS ${calcAmount(totalSXP,'SXP')}`, calc:true },
                { label:'Total revenue', value:`GHS ${(parseFloat(calcAmount(totalSXP,'SXP'))+parseFloat(calcAmount(totalDXP,'DXP'))).toFixed(2)}`, calc:false },
                { label:'Dealer earnings ★', value:`GHS ${dealerEarnings.toFixed(2)}`, calc:true, green:true },
              ].map(cell => (
                <div key={cell.label} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--text-3)', marginBottom:4, textTransform:'uppercase', letterSpacing:0.3 }}>{cell.label}</div>
                  <div style={{ fontSize:16, fontWeight:700, color: cell.green ? 'var(--green)' : cell.calc ? 'var(--calc-text)' : 'var(--navy)', fontFamily: cell.calc ? 'var(--font-mono)' : 'var(--font)' }}>{cell.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <button className="btn btn-ghost">Clear form</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <i className="ph ph-floppy-disk"></i>
              {saving ? 'Saving...' : 'Save entry'}
            </button>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent readings</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Pump</th><th>Fuel</th><th>Opening</th>
                <th>Closing</th><th>Litres sold</th><th>Amount (GHS)</th><th>RTT</th>
              </tr>
            </thead>
            <tbody>
              {readings.slice(0,20).map(r => (
                <tr key={r.id}>
                  <td>{r.reading_date}</td>
                  <td><span className="badge badge-navy">{r.pump_id}</span></td>
                  <td><span className={`badge ${r.fuel_type === 'SXP' ? 'badge-blue' : 'badge-amber'}`}>{r.fuel_type}</span></td>
                  <td className="td-calc">{parseFloat(r.opening_meter).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(r.closing_meter).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(r.litres_sold).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(r.amount_ghs).toFixed(2)}</td>
                  <td className="td-calc" style={{ color:'var(--amber)' }}>{parseFloat(r.rtt_litres).toFixed(2)}</td>
                </tr>
              ))}
              {readings.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No readings yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}