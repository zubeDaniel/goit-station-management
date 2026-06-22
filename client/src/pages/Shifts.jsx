import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function Shifts() {
  const { showToast } = useToast()
  const { isAdminOrManager } = useRole()
  const [shifts, setShifts] = useState([])
  const [attendants, setAttendants] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ shift_date: new Date().toISOString().split('T')[0], P1:'', P2:'', P3:'' })

  useEffect(() => {
    Promise.all([api.get('/shifts'), api.get('/attendants')])
      .then(([sRes, aRes]) => { setShifts(sRes.data); setAttendants(aRes.data) })
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const [pump, attendant_id] of [['P1',form.P1],['P2',form.P2],['P3',form.P3]]) {
        if (!attendant_id) continue
        await api.post('/shifts', { shift_date: form.shift_date, pump_id: pump, attendant_id })
      }
      showToast('success', 'Shifts assigned', form.shift_date)
      const res = await api.get('/shifts')
      setShifts(res.data)
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="loading-screen">Loading shifts...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Shifts</h2><p>Attendant rotation log · one attendant per pump</p></div></div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Attendants</div></div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {attendants.filter(a => a.is_active).map(a => (
            <div key={a.id} style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 14px', background:'var(--navy-light)', border:'1px solid var(--navy-border)', borderRadius:'var(--r-md)' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#fff' }}>
                {a.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
              </div>
              <span style={{ fontSize:13, fontWeight:500, color:'var(--navy)' }}>{a.name}</span>
            </div>
          ))}
        </div>
      </div>

      {isAdminOrManager && (
        <div className="card mb-16">
          <div className="card-header"><div className="card-title">Assign shifts</div></div>
          <div className="form-group" style={{ marginBottom:14, maxWidth:220 }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.shift_date} onChange={e => setForm(p=>({...p,shift_date:e.target.value}))} />
          </div>
          <div className="form-row-3">
            {['P1','P2','P3'].map(pump => (
              <div key={pump} className="form-group">
                <label className="form-label">{pump} attendant</label>
                <select className="form-select" value={form[pump]} onChange={e => setForm(p=>({...p,[pump]:e.target.value}))}>
                  <option value="">Select attendant</option>
                  {attendants.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save shifts'}</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Shift history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Pump</th><th>Attendant</th></tr></thead>
            <tbody>
              {shifts.slice(0,30).map(s => (
                <tr key={s.id}><td>{s.shift_date}</td><td><span className="badge badge-navy">{s.pump_id}</span></td><td>{s.attendants?.name}</td></tr>
              ))}
              {shifts.length===0 && <tr><td colSpan={3} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No shifts yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}