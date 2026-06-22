import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function Deliveries() {
  const { showToast } = useToast()
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    fuel_type: 'DXP', tank_id: 'TANK_B',
    bol_number: '', truck_registration: '', driver_name: '',
    expected_litres: '', actual_litres: ''
  })

  useEffect(() => {
    api.get('/deliveries').then(res => setDeliveries(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/deliveries', form)
      showToast('success', 'Delivery logged', form.bol_number)
      const res = await api.get('/deliveries')
      setDeliveries(res.data)
      setForm(prev => ({ ...prev, bol_number:'', truck_registration:'', driver_name:'', expected_litres:'', actual_litres:'' }))
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="loading-screen">Loading deliveries...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Tanker Deliveries</h2><p>Log deliveries with BOL number and volume details</p></div></div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">New delivery</div></div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={form.delivery_date} onChange={e => setForm(p => ({...p, delivery_date:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Fuel type</label><select className="form-select" value={form.fuel_type} onChange={e => setForm(p => ({...p, fuel_type:e.target.value, tank_id: e.target.value==='SXP'?'TANK_A':'TANK_B'}))}><option value="SXP">SXP</option><option value="DXP">DXP</option></select></div>
          <div className="form-group"><label className="form-label">Tank</label><select className="form-select" value={form.tank_id} onChange={e => setForm(p => ({...p, tank_id:e.target.value}))}><option value="TANK_A">Tank A (SXP)</option><option value="TANK_B">Tank B (DXP)</option></select></div>
        </div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">BOL / Waybill no.</label><input className="form-input" value={form.bol_number} onChange={e => setForm(p => ({...p, bol_number:e.target.value}))} placeholder="WB-2026-0001" /></div>
          <div className="form-group"><label className="form-label">Truck registration</label><input className="form-input" value={form.truck_registration} onChange={e => setForm(p => ({...p, truck_registration:e.target.value}))} placeholder="GR-1234-22" /></div>
          <div className="form-group"><label className="form-label">Driver name</label><input className="form-input" value={form.driver_name} onChange={e => setForm(p => ({...p, driver_name:e.target.value}))} placeholder="Optional" /></div>
        </div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Expected litres</label><input className="form-input" type="number" value={form.expected_litres} onChange={e => setForm(p => ({...p, expected_litres:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Actual litres received</label><input className="form-input" type="number" value={form.actual_litres} onChange={e => setForm(p => ({...p, actual_litres:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Shortage (L)</label><input className="form-input is-calc" value={form.expected_litres && form.actual_litres ? (parseFloat(form.expected_litres)-parseFloat(form.actual_litres)).toFixed(2) : ''} readOnly /></div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save delivery'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Delivery history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Fuel</th><th>Tank</th><th>BOL</th><th>Truck</th><th>Expected</th><th>Actual</th><th>Shortage</th></tr></thead>
            <tbody>
              {deliveries.slice(0,20).map(d => (
                <tr key={d.id}>
                  <td>{d.delivery_date}</td>
                  <td><span className={`badge ${d.fuel_type==='SXP'?'badge-blue':'badge-amber'}`}>{d.fuel_type}</span></td>
                  <td>{d.tank_id}</td>
                  <td style={{ fontSize:11 }}>{d.bol_number}</td>
                  <td style={{ fontSize:11 }}>{d.truck_registration}</td>
                  <td className="td-calc">{parseFloat(d.expected_litres).toFixed(2)} L</td>
                  <td className="td-calc">{parseFloat(d.actual_litres).toFixed(2)} L</td>
                  <td><span className={`badge ${parseFloat(d.shortage_litres)>0?'badge-amber':'badge-green'}`}>{parseFloat(d.shortage_litres).toFixed(2)} L</span></td>
                </tr>
              ))}
              {deliveries.length===0 && <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No deliveries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}