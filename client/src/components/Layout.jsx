import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../hooks/useRole'
import { useState } from 'react'

const navItems = [
  { section: 'Operations', items: [
    { path: '/',           label: 'Dashboard',   icon: 'ph-squares-four',    roles: ['admin','manager'] },
    { path: '/meter',      label: 'Meter Book',  icon: 'ph-gauge',           roles: ['admin','manager','viewer'] },
    { path: '/tank-stock', label: 'Tank Stock',  icon: 'ph-cylinder',        roles: ['admin','manager'] },
    { path: '/deliveries', label: 'Deliveries',  icon: 'ph-truck',           roles: ['admin','manager'] },
    { path: '/creditors',  label: 'Creditors',   icon: 'ph-users-three',     roles: ['admin','manager'] },
    { path: '/sales',      label: 'Sales Book',  icon: 'ph-receipt',         roles: ['admin','manager'] },
    { path: '/banking',    label: 'Banking',     icon: 'ph-bank',            roles: ['admin','manager'] },
    { path: '/expenses',   label: 'Expenses',    icon: 'ph-wallet',          roles: ['admin','manager'] },
  ]},
  { section: 'Compliance & Staff', items: [
    { path: '/compliance', label: 'Compliance',  icon: 'ph-clipboard-text',  roles: ['admin','manager'] },
    { path: '/shifts',     label: 'Shifts',      icon: 'ph-calendar-check',  roles: ['admin','manager','viewer'] },
  ]},
  { section: 'Intelligence', items: [
    { path: '/reports',    label: 'Reports',     icon: 'ph-chart-bar',       roles: ['admin','manager'] },
  ]},
  { section: 'Settings', items: [
    { path: '/prices',     label: 'Price Settings', icon: 'ph-tag',          roles: ['admin','manager'] },
    { path: '/users',      label: 'Users',          icon: 'ph-user-gear',    roles: ['admin','manager'] },
    { path: '/import',     label: 'Import',         icon: 'ph-upload-simple',roles: ['admin','manager'] },
    { path: '/setup',      label: 'Station Setup',  icon: 'ph-sliders',      roles: ['admin','manager'] },
    { path: '/audit',      label: 'Audit Log',      icon: 'ph-shield-check', roles: ['admin'] },
  ]},
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { role } = useRole()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg)' }}>

      {/* Sidebar */}
      <div className="sidebar" style={{
        width: 'var(--sidebar-w)',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
      }}>
        {/* Brand */}
        <div style={{ padding:'20px 16px 18px', borderBottom:'1px solid var(--sidebar-border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:15, fontWeight:700, color:'#fff' }}>
            <div style={{ width:8, height:8, background:'var(--red)', borderRadius:'50%' }}></div>
            GOIL Kuntunso
          </div>
          <div style={{ fontSize:11, color:'var(--sidebar-text)', marginTop:3, paddingLeft:16 }}>
            Station Management
          </div>
        </div>

        {/* Nav */}
        {navItems.map(group => {
          const visibleItems = group.items.filter(item => item.roles.includes(role))
          if (!visibleItems.length) return null
          return (
            <div key={group.section}>
              <div style={{ padding:'20px 16px 6px', fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:1 }}>
                {group.section}
              </div>
              {visibleItems.map(item => {
                const active = location.pathname === item.path
                return (
                  <div
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    style={{
                      display:'flex', alignItems:'center', gap:9,
                      padding:'8px 12px', margin:'1px 8px',
                      borderRadius:'var(--r-sm)',
                      color: active ? '#fff' : 'var(--sidebar-text)',
                      background: active ? 'var(--sidebar-active)' : 'transparent',
                      fontWeight: active ? 500 : 400,
                      fontSize:13, cursor:'pointer',
                      transition:'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sidebar-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <i className={`ph ${item.icon}`} style={{ fontSize:16, flexShrink:0 }}></i>
                    <span>{item.label}</span>
                  </div>
                )
              })}
            </div>
          )
        })}

        <div style={{ flex:1 }}></div>

        {/* User */}
        <div style={{ padding:'12px 16px 16px', borderTop:'1px solid var(--sidebar-border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:'var(--navy-mid)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'#fff', flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:500, color:'rgba(255,255,255,0.85)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {user?.name}
            </div>
            <div style={{ fontSize:10, color:'var(--sidebar-text)', marginTop:1, textTransform:'capitalize' }}>
              {user?.role}
            </div>
          </div>
          <button onClick={handleLogout} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--sidebar-text)', fontSize:16, padding:4 }} title="Logout">
            <i className="ph ph-sign-out"></i>
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {/* Topbar */}
        <div style={{ height:'var(--topbar-h)', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', flexShrink:0 }}>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--navy)' }}>
            {navItems.flatMap(g => g.items).find(i => i.path === location.pathname)?.label || 'Dashboard'}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ fontSize:12, color:'var(--text-3)', padding:'4px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:20 }}>
              {new Date().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 10px 4px 4px', background:'var(--navy-light)', border:'1px solid var(--navy-border)', borderRadius:20, fontSize:12, fontWeight:500, color:'var(--navy)' }}>
              <div style={{ width:20, height:20, background:'var(--navy)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:'#fff' }}>
                {initials}
              </div>
              <span style={{ textTransform:'capitalize' }}>{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}