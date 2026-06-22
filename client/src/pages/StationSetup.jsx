import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function StationSetup() {
  const { showToast } = useToast()
  const { isAdmin } = useRole()
  const [setup, setSetup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetConfirm, setResetConfirm] = useState('')

  useEffect(() => {
    api.get('/setup').then(res => setSetup(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/setup', setup)
      showToast('success', 'Station setup updated')
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  const handleReset = async (type) => {
    if (resetConfirm !== 'RESET') { showToast('error', 'Type RESET to confirm'); return }
    try {
      await api.post(`/setup/reset/${type}`, { confirmation: 'RESET' })
      showToast('success', `${type === 'soft' ? 'Soft' : 'Full'} reset complete`, 'Audit log untouched')
      setResetConfirm('')
    } catch (err) { showToast('error', 'Reset failed', err.response?.data?.error) }
  }

  if (loading) return <div className="loading-screen">Loading station setup...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Station Setup</h2><p>Configuration · Danger Zone (Admin only)</p></div></div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Station configuration</div></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Station name</label><input className="form-input" value={setup?.station_name||''} onChange={e => setSetup(p=>({...p,station_name:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Dealer code</label><input className="form-input" value={setup?.dealer_code||''} onChange={e => setSetup(p=>({...p,dealer_code:e.target.value}))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={setup?.location||''} onChange={e => setSetup(p=>({...p,location:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">System start date</label><input className="form-input" type="date" value={setup?.system_start_date||''} onChange={e => setSetup(p=>({...p,system_start_date:e.target.value}))} /></div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save changes'}</button>
        </div>
      </div>

      {isAdmin && (
        <div className="card" style={{ border:'1px solid var(--red-border)', background:'var(--red-subtle)' }}>
          <div className="card-header"><div className="card-title" style={{ color:'var(--red)', display:'flex', alignItems:'center', gap:6 }}><i className="ph ph-warning"></i> Danger zone</div><span className="badge badge-red">Admin only</span></div>
          <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:16, lineHeight:1.6 }}>Both reset options are irreversible. Audit log is never cleared by any reset operation.</div>
          <div className="form-group" style={{ marginBottom:14, maxWidth:300 }}>
            <label className="form-label">Type RESET to confirm</label>
            <input className="form-input" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="RESET" />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-ghost" style={{ borderColor:'var(--amber-border)', color:'var(--amber)' }} onClick={() => handleReset('soft')}><i className="ph ph-wrench"></i> Soft reset</button>
            <button className="btn btn-danger" onClick={() => handleReset('full')}><i className="ph ph-trash"></i> Full reset</button>
          </div>
        </div>
      )}
    </div>
  )
}