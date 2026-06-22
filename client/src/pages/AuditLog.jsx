import { useState, useEffect } from 'react'
import api from '../lib/api'

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/audit').then(res => setLogs(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const actionColor = { INSERT:'badge-green', UPDATE:'badge-blue', DELETE:'badge-red' }

  if (loading) return <div className="loading-screen">Loading audit log...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Audit Log</h2><p>Immutable record of all system changes — read only</p></div></div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Timestamp</th><th>Table</th><th>Action</th><th>Changed by</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize:11, fontFamily:'var(--font-mono)' }}>{new Date(l.changed_at).toLocaleString()}</td>
                  <td><span className="badge badge-neutral">{l.table_name}</span></td>
                  <td><span className={`badge ${actionColor[l.action]||'badge-neutral'}`}>{l.action}</span></td>
                  <td style={{ fontSize:12 }}>{l.users?.name || '—'}</td>
                </tr>
              ))}
              {logs.length===0 && <tr><td colSpan={4} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No audit entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}