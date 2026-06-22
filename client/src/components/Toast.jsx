import { useState, useEffect, createContext, useContext, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((type, title, message) => {
    const id = Date.now()
    setToasts(prev => [...prev.slice(-2), { id, type, title, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <i className={`ph ${
              toast.type === 'success' ? 'ph-check-circle' :
              toast.type === 'error'   ? 'ph-x-circle' :
              toast.type === 'warning' ? 'ph-warning-circle' : 'ph-info'
            }`} style={{ fontSize:16, flexShrink:0, marginTop:1, color:
              toast.type === 'success' ? 'var(--green)' :
              toast.type === 'error'   ? 'var(--red)' :
              toast.type === 'warning' ? 'var(--amber)' : 'var(--blue)'
            }}></i>
            <div>
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-msg">{toast.message}</div>}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', fontSize:14, marginLeft:'auto', padding:0 }}
            >
              <i className="ph ph-x"></i>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}