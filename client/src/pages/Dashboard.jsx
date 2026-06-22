import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../lib/api'

export default function Dashboard() {
  const { user } = useAuth()
  const [setup, setSetup] = useState(null)
  const [compliance, setCompliance] = useState([])
  const [loading, setLoading] = useState(true)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name?.split(' ')[0]

  useEffect(() => {
    Promise.all([
      api.get('/setup'),
      api.get('/compliance')
    ]).then(([setupRes, compRes]) => {
      setSetup(setupRes.data)
      setCompliance(compRes.data)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  const expiredCerts = compliance.filter(c => c.status === 'expired')
  const warningCerts = compliance.filter(c => c.status === 'warning')

  if (loading) return <div className="loading-screen">Loading dashboard...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{greeting}, {firstName}</h2>
          <p>{setup?.station_name} · {setup?.pump_count} pumps · {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
        </div>
      </div>

      {/* Alerts */}
      {expiredCerts.map(cert => (
        <div key={cert.id} className="alert alert-critical">
          <div className="alert-body">
            <div className="alert-title">{cert.certificate_name} has expired</div>
            <div className="alert-desc">Expired: {new Date(cert.expiry_date).toLocaleDateString()}. Renew immediately.</div>
          </div>
        </div>
      ))}
      {warningCerts.map(cert => (
        <div key={cert.id} className="alert alert-warning" style={{ marginBottom:8 }}>
          <div className="alert-body">
            <div className="alert-title">{cert.certificate_name} expiring soon</div>
            <div className="alert-desc">Expires: {new Date(cert.expiry_date).toLocaleDateString()}. Schedule renewal.</div>
          </div>
        </div>
      ))}

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginTop:16 }}>
        <div className="kpi-card kpi-red">
          <div className="kpi-label">Station</div>
          <div className="kpi-value" style={{ fontSize:16 }}>{setup?.station_name}</div>
          <div className="kpi-sub">{setup?.location}</div>
        </div>
        <div className="kpi-card kpi-blue">
          <div className="kpi-label">Active pumps</div>
          <div className="kpi-value">{setup?.pump_count}</div>
          <div className="kpi-sub">P1 · P2 · P3</div>
        </div>
        <div className="kpi-card kpi-amber">
          <div className="kpi-label">Dealer margin</div>
          <div className="kpi-value">GHS {parseFloat(setup?.dealer_margin_per_litre || 0.30).toFixed(2)}</div>
          <div className="kpi-sub">Per litre dispensed</div>
        </div>
        <div className="kpi-card kpi-green">
          <div className="kpi-label">Compliance alerts</div>
          <div className="kpi-value" style={{ color: expiredCerts.length > 0 ? 'var(--red)' : 'var(--navy)' }}>
            {expiredCerts.length + warningCerts.length}
          </div>
          <div className="kpi-sub">{expiredCerts.length} expired · {warningCerts.length} warning</div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid-2 mb-16" style={{ marginTop:16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Quick actions</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { label:'Enter today\'s meter readings', path:'/meter', icon:'ph-gauge' },
              { label:'Record tank stock dip reading', path:'/tank-stock', icon:'ph-cylinder' },
              { label:'Enter today\'s sales', path:'/sales', icon:'ph-receipt' },
              { label:'Record banking', path:'/banking', icon:'ph-bank' },
            ].map(action => (
              <a key={action.path} href={action.path} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--surface-2)', borderRadius:'var(--r-md)', border:'1px solid var(--border)', textDecoration:'none', color:'var(--text-1)', fontSize:13, fontWeight:500 }}>
                <i className={`ph ${action.icon}`} style={{ fontSize:16, color:'var(--navy)' }}></i>
                {action.label}
              </a>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Station setup status</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { label:'Setup completed', value: setup?.setup_completed ? 'Yes' : 'Pending', ok: setup?.setup_completed },
              { label:'System start date', value: setup?.system_start_date ? new Date(setup.system_start_date).toLocaleDateString() : 'Not set', ok: !!setup?.system_start_date },
              { label:'Dealer code', value: setup?.dealer_code || 'Not set', ok: !!setup?.dealer_code },
              { label:'Tanks', value: `${setup?.tank_count} underground tanks`, ok: true },
            ].map(item => (
              <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, color:'var(--text-2)' }}>{item.label}</span>
                <span className={`badge ${item.ok ? 'badge-green' : 'badge-amber'}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}