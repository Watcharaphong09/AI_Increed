import { useEffect } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../store/appStore'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import ChatPanel from '../components/ChatPanel'
import StatusBar from '../components/StatusBar'
import RequirementPanel from '../components/RequirementPanel'
import ApprovalPanel from '../components/ApprovalPanel'
import SettingsPanel from '../components/SettingsPanel'

function ToastNotification() {
  const { toast, clearToast } = useAppStore()
  if (!toast) return null

  const iconMap = {
    success: <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
  }

  const colorMap = {
    success: 'border-green-500/40 bg-green-950/60',
    error: 'border-red-500/40 bg-red-950/60',
    info: 'border-blue-500/40 bg-blue-950/60',
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm">
      <div
        className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl backdrop-blur-sm',
          colorMap[toast.type]
        )}
      >
        {iconMap[toast.type]}
        <p className="text-sm text-gray-200 flex-1">{toast.message}</p>
        <button
          onClick={clearToast}
          className="text-gray-500 hover:text-gray-300 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function ProjectPage() {
  const { setShowSettings } = useAppStore()

  // Keyboard shortcut: Cmd/Ctrl + , to open settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setShowSettings(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setShowSettings])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950">
      <Header />

      <div className="flex flex-1 min-h-0">
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          <ChatPanel />
          <StatusBar />
          <RequirementPanel />
          <ApprovalPanel />
        </main>
      </div>

      <SettingsPanel />
      <ToastNotification />
    </div>
  )
}
