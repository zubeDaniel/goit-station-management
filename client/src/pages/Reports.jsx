import { useState } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function Reports() {
  const { showToast } = useToast()
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadReport = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/reports/${month}`)
      setReport(res.data)
    } catch (err) { showToast('error', 'Failed to load report', err.response?.data?.error) }
    finally { setLoading(false) }
  }

  const s5 = report?.section5_consolidated

  return (
    <div>
      <div className="page-header">
        <div><h2>Reports</h2><p>Monthly operations report — 7 sections</p></div>
        <div className="page-header-actions">
          <input className="form-input" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width:160 }} />
          <button className="btn btn-primary" onClick={loadReport} disabled={loading}>
            <i className="ph ph-chart-bar"></i> {loading ? 'Loading...' : 'Generate report'}
          </button>
        </div>
      </div>

      {!report && !loading && (
        <div className="card" style={{ textAlign:'center', padding:48 }}>
          <i className="ph ph-chart-bar" style={{ fontSize:48, color:'var(--text-3)', display:'block', marginBottom:16 }}></i>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--navy)', marginBottom:8 }}>Select a month and generate the report</div>
          <div style={{ fontSize:13, color:'var(--text-3)' }}>All 7 sections will appear here — fuel sales, banking, creditors, dealer margin, and more.</div>
        </div>
      )}

      {report && (
        <>
          {/* Section 5 — Consolidated */}
          <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:16 }}>
            <div className="kpi-card kpi-red"><div className="kpi-label">Total revenue</div><div className="kpi-value">GHS {parseFloat(s5?.total_revenue||0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
            <div className="kpi-card kpi-blue"><div className="kpi-label">Total litres</div><div className="kpi-value">{parseFloat(s5?.total_litres||0).toLocaleString(undefined,{minimumFractionDigits:2})} L</div><div className="kpi-sub">SXP {parseFloat(s5?.total_sxp_litres||0).toFixed(2)} · DXP {parseFloat(s5?.total_dxp_litres||0).toFixed(2)}</div></div>
            <div className="kpi-card kpi-green"><div className="kpi-label">Dealer earnings</div><div className="kpi-value">GHS {parseFloat(s5?.dealer_earnings||0).toLocaleString(undefined,{minimumFractionDigits:2})}</div><div className="kpi-sub">GHS {report.dealer_margin_per_litre}/L × {parseFloat(s5?.total_litres||0).toFixed(2)} L</div></div>
            <div className="kpi-card kpi-green"><div className="kpi-label">Net dealer profit</div><div className="kpi-value" style={{ color: parseFloat(s5?.net_dealer_profit||0)<0?'var(--red)':'var(--navy)' }}>GHS {parseFloat(s5?.net_dealer_profit||0).toLocaleString(undefined,{minimumFractionDigits:2})}</div><div className="kpi-sub">Earnings − Expenses</div></div>
          </div>

          {/* Section 1 */}
          <div className="card mb-16">
            <div className="card-header"><div className="card-title">Section 1 — Fuel Sales Summary</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Pump</th><th>Fuel</th><th>Litres sold</th><th>Amount (GHS)</th><th>RTT (L)</th></tr></thead>
                <tbody>
                  {report.section1_fuel_sales.slice(0,20).map(r => (
                    <tr key={r.id}><td>{r.reading_date}</td><td>{r.pump_id}</td><td><span className={`badge ${r.fuel_type==='SXP'?'badge-blue':'badge-amber'}`}>{r.fuel_type}</span></td><td className="td-calc">{parseFloat(r.litres_sold).toFixed(2)}</td><td className="td-calc">GHS {parseFloat(r.amount_ghs).toFixed(2)}</td><td className="td-calc" style={{ color:'var(--amber)' }}>{parseFloat(r.rtt_litres).toFixed(2)}</td></tr>
                  ))}
                  {report.section1_fuel_sales.length===0 && <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No data for this period</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 7 — Dealer margin */}
          <div className="card" style={{ borderColor:'var(--green-border)' }}>
            <div className="card-header">
              <div><div className="card-title" style={{ color:'var(--green)' }}>Section 7 — Dealer Margin Summary</div><div className="card-subtitle">GHS {report.dealer_margin_per_litre}/L × total litres dispensed</div></div>
              <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', marginBottom:2 }}>Monthly total</div><div style={{ fontSize:22, fontWeight:700, color:'var(--green)', fontFamily:'var(--font-mono)' }}>GHS {parseFloat(s5?.dealer_earnings||0).toFixed(2)}</div></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}