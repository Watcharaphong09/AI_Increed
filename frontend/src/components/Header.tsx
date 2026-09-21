import { Settings, Cpu } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export default function Header() {
  const { setShowSettings } = useAppStore()

  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0 z-10">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-2">
        <Cpu className="w-5 h-5 text-blue-400" />
        <span className="text-sm font-semibold text-gray-100 tracking-widest uppercase">
          AI Dev Workspace
        </span>
      </div>

      {/* Right: Status + Settings */}
      <div className="flex items-center gap-4">
        {/* LOCAL indicator */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 font-medium">LOCAL</span>
          <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e]" />
        </div>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded-md transition-colors"
          title="ตั้งค่า"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
