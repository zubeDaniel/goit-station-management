import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function StationSetup() {
  const { showToast } = useToast()
  const { isAdmin } = useRole()
  const [setup, setSetup] = useState(null)
  const [attendants, setAttendants] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [resetConfirm, setResetConfirm] = useState('')
  const [newAttendantName, setNewAttendantName] = useState('')

  const [wizardData, setWizardData] = useState({
    station_name: '',
    dealer_code: '',
    location: '',
    system_start_date: new Date().toISOString().split('T')[0],
    pump_count: 3,
    tank_count: 2,
    sxp_price: '',
    dxp_price: '',
    price_effective_date: new Date().toISOString().split('T')[0],
    npa_reference: '',
    dealer_margin_per_litre: '0.3000',
    P1_SXP_meter: '',
    P1_DXP_meter: '',
    P2_SXP_meter: '',
    P2_DXP_meter: '',
    P3_DXP_meter: '',
    tank_a_volume: '',
    tank_b_volume: '',
    tank_date: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    Promise.all([api.get('/setup'), api.get('/attendants')])
      .then(([setupRes, attRes]) => {
        setSetup(setupRes.data)
        setAttendants(attRes.data)
        setWizardData(prev => ({
          ...prev,
          station_name: setupRes.data.station_name || '',
          dealer_code: setupRes.data.dealer_code || '',
          location: setupRes.data.location || '',
          system_start_date: setupRes.data.system_start_date || new Date().toISOString().split('T')[0],
          pump_count: setupRes.data.pump_count || 3,
          tank_count: setupRes.data.tank_count || 2,
          dealer_margin_per_litre: setupRes.data.dealer_margin_per_litre || '0.3000',
        }))
      }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSaveSetup = async () => {
    setSaving(true)
    try {
      await api.put('/setup', setup)
      showToast('success', 'Station setup updated')
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error)
    } finally {
      setSaving(false)
    }
  }

  const handleAddAttendant = async () => {
    if (!newAttendantName.trim()) return
    try {
      await api.post('/attendants', { name: newAttendantName.trim() })
      showToast('success', 'Attendant added', newAttendantName)
      setNewAttendantName('')
      const res = await api.get('/attendants')
      setAttendants(res.data)
    } catch (err) {
      showToast('error', 'Failed to add attendant')
    }
  }

  const handleDeactivateAttendant = async (id) => {
    try {
      await api.put(`/attendants/${id}`, { is_active: false })
      showToast('success', 'Attendant deactivated')
      const res = await api.get('/attendants')
      setAttendants(res.data)
    } catch (err) {
      showToast('error', 'Failed to deactivate attendant')
    }
  }

  const handleWizardNext = async () => {
    setSaving(true)
    try {
      if (wizardStep === 1) {
        await api.put('/setup', {
          ...setup,
          station_name: wizardData.station_name,
          dealer_code: wizardData.dealer_code,
          location: wizardData.location,
          system_start_date: wizardData.system_start_date,
          pump_count: wizardData.pump_count,
          tank_count: wizardData.tank_count,
        })
        showToast('success', 'Station details saved')
      }

      if (wizardStep === 2) {
        if (wizardData.sxp_price) {
          await api.post('/prices', {
            fuel_type: 'SXP',
            price_per_litre: wizardData.sxp_price,
            effective_date: wizardData.price_effective_date,
            npa_reference: wizardData.npa_reference,
          })
        }
        if (wizardData.dxp_price) {
          await api.post('/prices', {
            fuel_type: 'DXP',
            price_per_litre: wizardData.dxp_price,
            effective_date: wizardData.price_effective_date,
            npa_reference: wizardData.npa_reference,
          })
        }
        await api.put('/setup', { ...setup, dealer_margin_per_litre: wizardData.dealer_margin_per_litre })
        showToast('success', 'Fuel prices saved')
      }

      if (wizardStep === 3) {
        // Save baseline meter readings as synthetic "day before system_start_date" records
        // MeterBook auto-fill picks these up as opening meters on day 1
        const baselineDate = new Date(wizardData.system_start_date)
        baselineDate.setDate(baselineDate.getDate() - 1)
        const dateStr = baselineDate.toISOString().split('T')[0]

        const meterEntries = [
          { pump_id: 'P1', fuel_type: 'SXP', value: wizardData.P1_SXP_meter },
          { pump_id: 'P1', fuel_type: 'DXP', value: wizardData.P1_DXP_meter },
          { pump_id: 'P2', fuel_type: 'SXP', value: wizardData.P2_SXP_meter },
          { pump_id: 'P2', fuel_type: 'DXP', value: wizardData.P2_DXP_meter },
          { pump_id: 'P3', fuel_type: 'DXP', value: wizardData.P3_DXP_meter },
        ]

        for (const entry of meterEntries) {
          if (!entry.value) continue
          await api.post('/meter', {
            reading_date:  dateStr,
            pump_id:       entry.pump_id,
            fuel_type:     entry.fuel_type,
            attendant_id:  null,
            opening_meter: parseFloat(entry.value),
            closing_meter: parseFloat(entry.value),
            rtt_litres:    0,
          })
        }
        showToast('success', 'Opening meters saved', `Baseline set for ${wizardData.system_start_date}`)
      }

      if (wizardStep === 4) {
        const today = wizardData.tank_date
        if (wizardData.tank_a_volume) {
          await api.post('/tank-stock', {
            stock_date:        today,
            tank_id:           'TANK_A',
            fuel_type:         'SXP',
            opening_stock:     0,
            litres_sold:       0,
            delivery_litres:   parseFloat(wizardData.tank_a_volume),
            closing_stock_dip: parseFloat(wizardData.tank_a_volume),
            actual_variance:   0,
            expected_variance: 0,
          })
        }
        if (wizardData.tank_b_volume) {
          await api.post('/tank-stock', {
            stock_date:        today,
            tank_id:           'TANK_B',
            fuel_type:         'DXP',
            opening_stock:     0,
            litres_sold:       0,
            delivery_litres:   parseFloat(wizardData.tank_b_volume),
            closing_stock_dip: parseFloat(wizardData.tank_b_volume),
            actual_variance:   0,
            expected_variance: 0,
          })
        }
        showToast('success', 'Opening tank stock saved')
      }

      if (wizardStep === 6) {
        await api.put('/setup', { ...setup, setup_completed: true })
        showToast('success', 'Setup complete!', 'Station is ready to use')
        setShowWizard(false)
        const res = await api.get('/setup')
        setSetup(res.data)
        return
      }

      setWizardStep(prev => prev + 1)
    } catch (err) {
      showToast('error', 'Step failed', err.response?.data?.error)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async (type) => {
    if (resetConfirm !== 'RESET') {
      showToast('error', 'Type RESET to confirm')
      return
    }
    try {
      await api.post(`/setup/reset/${type}`, { confirmation: 'RESET' })
      showToast('success', `${type === 'soft' ? 'Soft' : 'Full'} reset complete`, 'Audit log untouched')
      setResetConfirm('')
    } catch (err) {
      showToast('error', 'Reset failed', err.response?.data?.error)
    }
  }

  const TOTAL_STEPS = 6
  const stepLabels = ['Station', 'Prices', 'Meters', 'Tank stock', 'Attendants', 'Complete']

  if (loading) return <div className="loading-screen">Loading station setup...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Station Setup</h2>
          <p>Configuration · Attendants · Danger Zone (Admin only)</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => { setShowWizard(true); setWizardStep(1) }}>
            <i className="ph ph-sliders"></i> Run setup wizard
          </button>
        </div>
      </div>

      {/* ── Setup Wizard Overlay ── */}
      {showWizard && (
        <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:300, overflowY:'auto' }}>

          {/* Wizard topbar */}
          <div style={{ background:'var(--charcoal)', padding:'0 32px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, color:'#fff', fontSize:14, fontWeight:600 }}>
              <div style={{ width:8, height:8, background:'var(--orange)', borderRadius:'50%' }}></div>
              GOIL Kuntunso — Station Setup
            </div>
            <div
              onClick={() => setShowWizard(false)}
              style={{ fontSize:12, color:'rgba(255,255,255,0.5)', cursor:'pointer', padding:'6px 10px', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'var(--r-sm)' }}
            >
              Skip for now →
            </div>
          </div>

          {/* Progress steps */}
          <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'16px 32px' }}>
            <div style={{ display:'flex', alignItems:'center', maxWidth:720, margin:'0 auto' }}>
              {stepLabels.map((label, i) => {
                const step  = i + 1
                const done   = step < wizardStep
                const active = step === wizardStep
                return (
                  <div key={step} style={{ display:'flex', alignItems:'center', flex: step < TOTAL_STEPS ? 1 : 0 }}>
                    <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center' }}>
                      <div style={{
                        width:28, height:28, borderRadius:'50%',
                        background: done ? 'var(--green)' : active ? 'var(--orange)' : 'var(--surface)',
                        border:`2px solid ${done ? 'var(--green)' : active ? 'var(--orange)' : 'var(--border)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:11, fontWeight:600,
                        color: done || active ? '#fff' : 'var(--text-3)',
                        zIndex:1,
                      }}>
                        {done ? <i className="ph ph-check" style={{ fontSize:12 }}></i> : step}
                      </div>
                      <span style={{
                        position:'absolute', top:34, fontSize:10, whiteSpace:'nowrap',
                        fontWeight: active ? 600 : 500,
                        color: done ? 'var(--green)' : active ? 'var(--orange)' : 'var(--text-3)',
                      }}>
                        {label}
                      </span>
                    </div>
                    {step < TOTAL_STEPS && (
                      <div style={{ flex:1, height:2, background: done ? 'var(--green)' : 'var(--border)', margin:'0 4px' }}></div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Wizard body */}
          <div style={{ padding:'48px 32px 32px', display:'flex', justifyContent:'center' }}>
            <div style={{ width:'100%', maxWidth:640 }}>

              {/* Step 1 — Station details */}
              {wizardStep === 1 && (
                <div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--charcoal)', marginBottom:6 }}>Confirm station details</div>
                  <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:28, lineHeight:1.6 }}>Verify your station information. This appears on all reports and exports.</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Station name</label>
                      <input className="form-input" value={wizardData.station_name}
                        onChange={e => setWizardData(p => ({ ...p, station_name: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">GOIL dealer code</label>
                      <input className="form-input" value={wizardData.dealer_code}
                        onChange={e => setWizardData(p => ({ ...p, dealer_code: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Location / town</label>
                      <input className="form-input" value={wizardData.location}
                        onChange={e => setWizardData(p => ({ ...p, location: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">System start date</label>
                      <input className="form-input" type="date" value={wizardData.system_start_date}
                        onChange={e => setWizardData(p => ({ ...p, system_start_date: e.target.value }))} />
                      <span className="form-hint">The date you begin entering data into this system</span>
                    </div>
                  </div>
                  <div style={{ background:'var(--orange-subtle)', border:'1px solid var(--orange-border)', borderRadius:'var(--r-md)', padding:'12px 14px', fontSize:12, color:'var(--charcoal)', lineHeight:1.6, marginBottom:20, display:'flex', gap:10 }}>
                    <i className="ph ph-info" style={{ fontSize:16, flexShrink:0, marginTop:1, color:'var(--orange)' }}></i>
                    P1 and P2 dispense SXP + DXP. P3 dispenses DXP only. Tank A (SXP) feeds P1 and P2. Tank B (DXP) feeds P1, P2, and P3.
                  </div>
                </div>
              )}

              {/* Step 2 — Fuel prices */}
              {wizardStep === 2 && (
                <div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--charcoal)', marginBottom:6 }}>Set current fuel prices</div>
                  <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:28, lineHeight:1.6 }}>Enter the current NPA-approved pump prices. Every amount calculation depends on these values.</div>
                  <div style={{ background:'var(--amber-subtle)', border:'1px solid var(--amber-border)', borderRadius:'var(--r-md)', padding:'12px 14px', fontSize:12, color:'var(--amber)', marginBottom:20, display:'flex', gap:10 }}>
                    <i className="ph ph-warning" style={{ fontSize:16, flexShrink:0, marginTop:1 }}></i>
                    GOIL pump prices are regulated by the NPA. Always verify against the latest NPA bulletin.
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">SXP — Super XP 91 (GHS/litre)</label>
                      <input className="form-input" type="number" step="0.0001" placeholder="e.g. 14.3400"
                        value={wizardData.sxp_price}
                        onChange={e => setWizardData(p => ({ ...p, sxp_price: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">DXP — Diesel XP (GHS/litre)</label>
                      <input className="form-input" type="number" step="0.0001" placeholder="e.g. 13.8200"
                        value={wizardData.dxp_price}
                        onChange={e => setWizardData(p => ({ ...p, dxp_price: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Price effective date</label>
                      <input className="form-input" type="date" value={wizardData.price_effective_date}
                        onChange={e => setWizardData(p => ({ ...p, price_effective_date: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">NPA reference</label>
                      <input className="form-input" placeholder="NPA Bulletin reference"
                        value={wizardData.npa_reference}
                        onChange={e => setWizardData(p => ({ ...p, npa_reference: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ maxWidth:320 }}>
                    <div className="form-group">
                      <label className="form-label">Dealer margin (GHS/L)</label>
                      <input className="form-input" type="number" step="0.0001"
                        value={wizardData.dealer_margin_per_litre}
                        onChange={e => setWizardData(p => ({ ...p, dealer_margin_per_litre: e.target.value }))} />
                      <span className="form-hint">GHS earned per litre dispensed — default 0.30</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 — Opening meters */}
              {wizardStep === 3 && (
                <div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--charcoal)', marginBottom:6 }}>Enter opening meter readings</div>
                  <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:28, lineHeight:1.6 }}>Read the current meter values physically from each pump nozzle. These become the baseline for calculating litres sold.</div>
                  <div style={{ background:'var(--orange-subtle)', border:'1px solid var(--orange-border)', borderRadius:'var(--r-md)', padding:'12px 14px', fontSize:12, color:'var(--charcoal)', marginBottom:20, display:'flex', gap:10 }}>
                    <i className="ph ph-info" style={{ fontSize:16, flexShrink:0, color:'var(--orange)' }}></i>
                    Go to each pump and read the odometer display. Enter exactly what you see. These are cumulative totals, not daily figures.
                  </div>

                  {[['P1','SXP','DXP'],['P2','SXP','DXP'],['P3','DXP']].map(([pump, ...fuels]) => (
                    <div key={pump} style={{ border:'1px solid var(--border)', borderRadius:'var(--r-md)', overflow:'hidden', marginBottom:12 }}>
                      <div style={{ background:'var(--charcoal)', color:'#fff', padding:'9px 14px', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ background:'rgba(255,255,255,0.15)', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700 }}>{pump}</span>
                        Pump {pump.slice(1)} — {fuels.join(' + ')}
                      </div>
                      <div style={{ padding:14 }}>
                        <div className="form-row" style={{ maxWidth: fuels.length === 1 ? 300 : '100%' }}>
                          {fuels.map(fuel => (
                            <div key={fuel} className="form-group">
                              <label className="form-label">
                                <span style={{ display:'inline-block', width:8, height:8, background: fuel === 'SXP' ? 'var(--orange)' : 'var(--amber)', borderRadius:'50%', marginRight:5 }}></span>
                                {fuel} opening meter (L)
                              </label>
                              <input className="form-input" type="number" placeholder="e.g. 44821.50"
                                value={wizardData[`${pump}_${fuel}_meter`]}
                                onChange={e => setWizardData(p => ({ ...p, [`${pump}_${fuel}_meter`]: e.target.value }))} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 4 — Tank stock */}
              {wizardStep === 4 && (
                <div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--charcoal)', marginBottom:6 }}>Enter opening tank stock</div>
                  <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:28, lineHeight:1.6 }}>Do a dip stick reading on both tanks and enter the current volume. This is the baseline for all stock reconciliation.</div>
                  <div style={{ background:'var(--orange-subtle)', border:'1px solid var(--orange-border)', borderRadius:'var(--r-md)', padding:'12px 14px', fontSize:12, color:'var(--charcoal)', marginBottom:20, display:'flex', gap:10 }}>
                    <i className="ph ph-info" style={{ fontSize:16, flexShrink:0, color:'var(--orange)' }}></i>
                    Use the dip stick to physically measure the fuel level in each underground tank. Convert your dip reading to litres using the tank calibration chart.
                  </div>
                  <div className="form-row">
                    <div className="card" style={{ marginBottom:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                        <i className="ph ph-cylinder" style={{ fontSize:18, color:'var(--orange)' }}></i>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--charcoal)' }}>Tank A — SXP</div>
                          <div style={{ fontSize:11, color:'var(--text-3)' }}>Feeds P1 and P2 · Capacity: 10,000 L</div>
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom:10 }}>
                        <label className="form-label">Current volume (litres)</label>
                        <input className="form-input" type="number" placeholder="e.g. 8200"
                          value={wizardData.tank_a_volume}
                          onChange={e => setWizardData(p => ({ ...p, tank_a_volume: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Dip reading date</label>
                        <input className="form-input" type="date" value={wizardData.tank_date}
                          onChange={e => setWizardData(p => ({ ...p, tank_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="card" style={{ marginBottom:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                        <i className="ph ph-cylinder" style={{ fontSize:18, color:'var(--amber)' }}></i>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--charcoal)' }}>Tank B — DXP</div>
                          <div style={{ fontSize:11, color:'var(--text-3)' }}>Feeds P1, P2 and P3 · Capacity: 10,000 L</div>
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom:10 }}>
                        <label className="form-label">Current volume (litres)</label>
                        <input className="form-input" type="number" placeholder="e.g. 1875"
                          value={wizardData.tank_b_volume}
                          onChange={e => setWizardData(p => ({ ...p, tank_b_volume: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Dip reading date</label>
                        <input className="form-input" type="date" value={wizardData.tank_date}
                          onChange={e => setWizardData(p => ({ ...p, tank_date: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5 — Attendants */}
              {wizardStep === 5 && (
                <div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--charcoal)', marginBottom:6 }}>Pump attendants</div>
                  <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:28, lineHeight:1.6 }}>Add or review attendants who work at the station. You need at least one per pump.</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                    {attendants.filter(a => a.is_active).map(a => (
                      <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-md)' }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--orange-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--orange)', flexShrink:0 }}>
                          {a.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                        </div>
                        <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{a.name}</span>
                        <button
                          onClick={() => handleDeactivateAttendant(a.id)}
                          style={{ width:28, height:28, borderRadius:'var(--r-sm)', border:'none', background:'var(--red-subtle)', color:'var(--red)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                        >
                          <i className="ph ph-trash" style={{ fontSize:14 }}></i>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                    <input className="form-input" placeholder="Full name"
                      value={newAttendantName}
                      onChange={e => setNewAttendantName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddAttendant()} />
                    <button className="btn btn-ghost" onClick={handleAddAttendant}>
                      <i className="ph ph-plus"></i> Add
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-3)' }}>
                    {attendants.filter(a => a.is_active).length} attendants active
                  </div>
                </div>
              )}

              {/* Step 6 — Complete */}
              {wizardStep === 6 && (
                <div style={{ textAlign:'center', padding:'20px 0' }}>
                  <div style={{ width:56, height:56, background:'var(--green-subtle)', border:'2px solid var(--green-border)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                    <i className="ph ph-check-circle" style={{ fontSize:28, color:'var(--green)' }}></i>
                  </div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--charcoal)', marginBottom:8 }}>Setup complete</div>
                  <div style={{ fontSize:13, color:'var(--text-3)', maxWidth:420, margin:'0 auto 28px', lineHeight:1.6 }}>
                    Your station is ready. Fuel prices, opening meters, tank stock, and attendants are all set. You can update any of these at any time from this page.
                  </div>
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:20, maxWidth:420, margin:'0 auto 28px', textAlign:'left' }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:12 }}>Setup summary</div>
                    {[
                      { label:'Station details',    done: true },
                      { label:'Fuel prices set',    done: !!wizardData.sxp_price || !!wizardData.dxp_price },
                      { label:'Opening meters saved', done: !!wizardData.P1_SXP_meter || !!wizardData.P1_DXP_meter },
                      { label:'Tank stock entered',  done: !!wizardData.tank_a_volume || !!wizardData.tank_b_volume },
                      { label:`Attendants: ${attendants.filter(a => a.is_active).length} active`, done: attendants.filter(a => a.is_active).length > 0 },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:13, color:'var(--text-2)' }}>{item.label}</span>
                        <span className={`badge ${item.done ? 'badge-green' : 'badge-neutral'}`}>
                          {item.done ? 'Done' : 'Skipped'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Wizard nav */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:32, paddingTop:20, borderTop:'1px solid var(--border)' }}>
                <div>
                  {wizardStep > 1 && (
                    <button className="btn btn-ghost" onClick={() => setWizardStep(prev => prev - 1)}>
                      <i className="ph ph-arrow-left"></i> Back
                    </button>
                  )}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  {wizardStep < TOTAL_STEPS && (
                    <button className="btn btn-ghost" onClick={() => setWizardStep(prev => prev + 1)}>
                      Skip
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={handleWizardNext} disabled={saving}>
                    {wizardStep === TOTAL_STEPS
                      ? <><i className="ph ph-check"></i> {saving ? 'Completing...' : 'Complete setup'}</>
                      : <>{saving ? 'Saving...' : 'Continue'} <i className="ph ph-arrow-right"></i></>
                    }
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Settings page ── */}
      <div className="card mb-16">
        <div className="card-header">
          <div className="card-title">Station configuration</div>
          <span className={`badge ${setup?.setup_completed ? 'badge-green' : 'badge-amber'}`}>
            {setup?.setup_completed ? 'Setup complete' : 'Setup pending'}
          </span>
        </div>
        {setup && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Station name</label>
                <input className="form-input" value={setup.station_name || ''}
                  onChange={e => setSetup(p => ({ ...p, station_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Dealer code</label>
                <input className="form-input" value={setup.dealer_code || ''}
                  onChange={e => setSetup(p => ({ ...p, dealer_code: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" value={setup.location || ''}
                  onChange={e => setSetup(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">System start date</label>
                <input className="form-input" type="date" value={setup.system_start_date || ''}
                  onChange={e => setSetup(p => ({ ...p, system_start_date: e.target.value }))} />
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSaveSetup} disabled={saving}>
                <i className="ph ph-floppy-disk"></i> {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Attendants */}
      <div className="card mb-16">
        <div className="card-header">
          <div className="card-title">Pump attendants</div>
          <span className="badge badge-neutral">{attendants.filter(a => a.is_active).length} active</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
          {attendants.map(a => (
            <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background: a.is_active ? 'var(--surface)' : 'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'var(--r-md)', opacity: a.is_active ? 1 : 0.6 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--orange-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--orange)', flexShrink:0 }}>
                {a.name.split(' ').map(w => w[0]).join('').slice(0,2)}
              </div>
              <span style={{ flex:1, fontSize:13, fontWeight:500, color:'var(--text-1)' }}>{a.name}</span>
              <span className={`badge ${a.is_active ? 'badge-green' : 'badge-neutral'}`}>
                {a.is_active ? 'Active' : 'Inactive'}
              </span>
              {a.is_active && (
                <button
                  onClick={() => handleDeactivateAttendant(a.id)}
                  style={{ width:28, height:28, borderRadius:'var(--r-sm)', border:'none', background:'var(--red-subtle)', color:'var(--red)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                >
                  <i className="ph ph-trash" style={{ fontSize:14 }}></i>
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input className="form-input" placeholder="New attendant full name"
            value={newAttendantName}
            onChange={e => setNewAttendantName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddAttendant()} />
          <button className="btn btn-ghost" onClick={handleAddAttendant}>
            <i className="ph ph-plus"></i> Add attendant
          </button>
        </div>
      </div>

      {/* Danger Zone — Admin only */}
      {isAdmin && (
        <div className="card" style={{ border:'1px solid var(--red-border)', background:'var(--red-subtle)' }}>
          <div className="card-header">
            <div className="card-title" style={{ color:'var(--red)', display:'flex', alignItems:'center', gap:6 }}>
              <i className="ph ph-warning"></i> Danger zone
            </div>
            <span className="badge badge-red">Admin only</span>
          </div>
          <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:16, lineHeight:1.6 }}>
            Both reset options are irreversible. <strong>Audit log is never cleared by any reset operation.</strong>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            <div style={{ border:'1px solid var(--border)', borderRadius:'var(--r-md)', padding:14, background:'var(--surface)' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
                <i className="ph ph-wrench" style={{ color:'var(--amber)' }}></i> Soft reset
              </div>
              <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:12, lineHeight:1.5 }}>
                Clears setup data — prices, attendants, opening meters. Operational data preserved.
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ borderColor:'var(--amber-border)', color:'var(--amber)' }}
                onClick={() => handleReset('soft')}
              >
                <i className="ph ph-wrench"></i> Soft reset
              </button>
            </div>
            <div style={{ border:'1px solid var(--border)', borderRadius:'var(--r-md)', padding:14, background:'var(--surface)' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
                <i className="ph ph-trash" style={{ color:'var(--red)' }}></i> Full reset
              </div>
              <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:12, lineHeight:1.5 }}>
                Wipes everything — all setup and operational data. System returns to blank state.
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleReset('full')}>
                <i className="ph ph-trash"></i> Full reset
              </button>
            </div>
          </div>
          <div className="form-group" style={{ maxWidth:300 }}>
            <label className="form-label">Type RESET to confirm any reset action</label>
            <input className="form-input" value={resetConfirm}
              onChange={e => setResetConfirm(e.target.value)}
              placeholder="RESET" />
          </div>
        </div>
      )}
    </div>
  )
}