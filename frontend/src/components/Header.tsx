import { useEffect } from 'react'
import { Settings, Cpu, MessageSquare, CheckSquare, Sparkles, Bot } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useAppStore } from '../store/appStore'
import { getCapabilities } from '../api/handoff'
import { getSettings } from '../api/settings'

export default function Header() {
  const {
    setShowSettings,
    activeMainTab,
    setActiveMainTab,
    tasks,
    setBuilderCapabilities,
  } = useAppStore()

  // Fetch builder capabilities
  const { data: capabilities } = useQuery({
    queryKey: ['builder-capabilities'],
    queryFn: getCapabilities,
    staleTime: 60000,
  })

  // Fetch current AI settings to display active planner
  const { data: aiSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 30000,
  })

  useEffect(() => {
    if (capabilities) {
      setBuilderCapabilities(capabilities)
    }
  }, [capabilities, setBuilderCapabilities])

  const isGemini =
    !aiSettings ||
    aiSettings.base_url?.includes('googleapis') ||
    aiSettings.model?.toLowerCase().includes('gemini')

  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0 z-10">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-semibold text-gray-100 tracking-wider uppercase">
            AI Dev Workspace
          </span>
        </div>

        {/* Center: Main Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-gray-950/80 p-1 rounded-lg border border-gray-800">
          <button
            onClick={() => setActiveMainTab('chat')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
              activeMainTab === 'chat'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Planning Chat
          </button>
          <button
            onClick={() => setActiveMainTab('tasks')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
              activeMainTab === 'tasks'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            )}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Tasks & Handoff
            {tasks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-950 text-blue-300 text-[10px] font-bold border border-blue-800">
                {tasks.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Right: AI Planner badge + Antigravity status + LOCAL + Settings */}
      <div className="flex items-center gap-3">
        {/* Active AI Planner Badge (Gemini / GPT) */}
        <div
          onClick={() => setShowSettings(true)}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border font-medium cursor-pointer transition-all hover:border-gray-600',
            isGemini
              ? 'bg-blue-950/40 text-blue-300 border-blue-800/60'
              : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
          )}
          title="คลิกเพื่อสลับหรือตั้งค่า AI Planner"
        >
          {isGemini ? (
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          ) : (
            <Bot className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span className="text-gray-400">Planner:</span>
          <span className="font-semibold">
            {isGemini ? 'Google Gemini' : 'OpenAI (GPT)'}
          </span>
        </div>

        {/* Antigravity Capability Badge (Section 8) */}
        <div
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border font-medium cursor-pointer transition-all hover:border-gray-600',
            capabilities?.installed
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
              : 'bg-gray-800/60 text-gray-400 border-gray-700'
          )}
          onClick={() => setShowSettings(true)}
          title={
            capabilities?.installed
              ? `Antigravity Detected: ${capabilities.executable_path || 'Installed'}`
              : 'Antigravity Not Detected (Manual Handoff Active)'
          }
        >
          <span className="text-gray-400">Builder:</span>
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              capabilities?.installed
                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                : 'bg-gray-500'
            )}
          />
          <span className="text-[11px] font-semibold">
            {capabilities?.installed ? 'Antigravity' : 'Manual'}
          </span>
        </div>

        {/* LOCAL indicator */}
        <div className="flex items-center gap-1.5 pl-1">
          <span className="text-xs text-gray-400 font-medium">LOCAL</span>
          <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e]" />
        </div>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded-md transition-colors"
          title="ตั้งค่า (Settings)"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
