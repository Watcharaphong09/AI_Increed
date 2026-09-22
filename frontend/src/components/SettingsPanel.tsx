import { useState, useEffect } from 'react'
import {
  X,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  Sparkles,
  Bot,
  AlertCircle,
  Check,
  Cpu,
  Folder,
  Zap,
  Terminal,
} from 'lucide-react'
import clsx from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { getSettings, updateSettings, testConnection } from '../api/settings'
import type { Settings } from '../types'

interface ApiKeyInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

function ApiKeyInput({ value, onChange, placeholder }: ApiKeyInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono pr-9 focus:outline-none focus:border-blue-500 placeholder-gray-600"
        placeholder={placeholder ?? 'วาง API Key ที่นี่...'}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-1"
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

export default function SettingsPanel() {
  const { showSettings, setShowSettings, showToast, builderCapabilities } = useAppStore()
  const queryClient = useQueryClient()

  // Active planning AI choice
  const [activeAi, setActiveAi] = useState<'gemini' | 'openai' | 'groq' | 'ollama' | 'custom'>('gemini')

  // Form states
  const [workspaceDir, setWorkspaceDir] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')

  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean
    success: boolean
    message: string
    latency_ms?: number
  } | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: showSettings,
    retry: false,
  })

  // Detect which provider is configured from loaded settings
  useEffect(() => {
    if (settings) {
      if (settings.workspace_dir) {
        setWorkspaceDir(settings.workspace_dir)
      }
      const currentBaseUrl = settings.ai_base_url || settings.base_url || ''
      const currentModel = settings.ai_model || settings.model || ''

      const isGemini =
        currentBaseUrl.includes('googleapis') ||
        currentModel.toLowerCase().includes('gemini') ||
        (settings.planner_base_url && settings.planner_base_url.includes('googleapis'))

      const isGroq = currentBaseUrl.includes('groq.com')
      const isOllama = currentBaseUrl.includes('11434') || currentBaseUrl.includes('ollama')
      const isOpenAI = currentBaseUrl.includes('openai.com') || currentModel.toLowerCase().includes('gpt')

      if (isGemini) {
        setActiveAi('gemini')
      } else if (isGroq) {
        setActiveAi('groq')
      } else if (isOllama) {
        setActiveAi('ollama')
      } else if (isOpenAI) {
        setActiveAi('openai')
      } else {
        setActiveAi('custom')
      }

      setBaseUrl(currentBaseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/')
      setModel(currentModel || 'gemini-2.5-flash')
      setApiKey(settings.ai_api_key_masked || settings.api_key || '')
    }
  }, [settings])

  // Presets switcher
  const handleSelectPreset = (preset: 'gemini' | 'openai' | 'groq' | 'ollama') => {
    setActiveAi(preset)
    setConnectionStatus(null)

    if (preset === 'gemini') {
      setBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai/')
      setModel('gemini-2.5-flash')
      if (apiKey.startsWith('sk-') || apiKey.startsWith('gsk_')) {
        setApiKey('')
      }
    } else if (preset === 'openai') {
      setBaseUrl('https://api.openai.com/v1')
      setModel('gpt-4o-mini')
      if (apiKey.startsWith('AQ.') || apiKey.startsWith('gsk_')) {
        setApiKey('')
      }
    } else if (preset === 'groq') {
      setBaseUrl('https://api.groq.com/openai/v1')
      setModel('llama-3.3-70b-versatile')
      if (apiKey.startsWith('AQ.') || apiKey.startsWith('sk-proj-')) {
        setApiKey('')
      }
    } else if (preset === 'ollama') {
      setBaseUrl('http://localhost:11434/v1')
      setModel('qwen2.5-coder:7b')
      setApiKey('ollama-local')
    }
  }

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Settings>) => updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว — นำไปใช้งานทันที', 'success')
      setConnectionStatus(null)
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => testConnection('planner'),
    onSuccess: (result) => {
      setConnectionStatus({
        tested: true,
        success: result.success,
        message: result.success
          ? `เชื่อมต่อสำเร็จ! โมเดล: ${result.model} (${result.latency_ms} ms)`
          : result.error || 'การเชื่อมต่อล้มเหลว',
        latency_ms: result.latency_ms,
      })
    },
    onError: (err: Error) => {
      setConnectionStatus({
        tested: true,
        success: false,
        message: err.message || 'การเชื่อมต่อขัดข้อง',
      })
    },
  })

  const handleSave = () => {
    const isOllama = activeAi === 'ollama' || baseUrl.includes('11434')
    const provider = isOllama ? 'ollama' : 'openai'

    const data: Partial<Settings> = {
      ai_provider: provider,
      ai_base_url: baseUrl.trim(),
      ai_model: model.trim(),
      planner_provider: provider,
      planner_base_url: baseUrl.trim(),
      planner_model: model.trim(),
    }

    if (workspaceDir.trim()) {
      data.workspace_dir = workspaceDir.trim()
    }

    // Only update api_key if user typed something new (not masked)
    if (apiKey && !apiKey.includes('...')) {
      data.ai_api_key = apiKey.trim()
      data.planner_api_key = apiKey.trim()
    }

    saveMutation.mutate(data)
  }

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        onClick={() => setShowSettings(false)}
      />

      {/* Panel Container */}
      <div className="relative w-full max-w-lg bg-gray-900 border-l border-gray-800 h-full flex flex-col shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/40 shrink-0">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-gray-100">ตั้งค่าระบบ (Settings)</h2>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Security Notice */}
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs text-blue-200/90 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              ข้อมูลทั้งหมด (API Key และ Workspace Path) จะถูกบันทึกไว้ในไฟล์ <code className="text-white font-mono">.env</code> ภายในเครื่องของคุณเท่านั้น ปลอดภัย ไม่มีการส่งออกภายนอก
            </span>
          </div>

          {/* Section 1: Workspace Folder */}
          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-amber-400" />
              <label className="text-xs font-semibold text-gray-200">
                โฟลเดอร์สำหรับสร้างโปรเจกต์ (Workspace Folder)
              </label>
            </div>
            <div className="space-y-1">
              <input
                type="text"
                value={workspaceDir}
                onChange={(e) => setWorkspaceDir(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono focus:outline-none focus:border-amber-500 placeholder-gray-600"
                placeholder="เช่น C:\Users\Username\Desktop\__Dev Projects__"
              />
              <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                💡 <strong>สำหรับส่งต่อให้เพื่อน:</strong> เพื่อนสามารถระบุ Path โฟลเดอร์ที่ต้องการให้ AI สร้างโปรเจกต์และเขียนไฟล์ลงในเครื่องของเพื่อนได้โดยตรง
              </p>
            </div>
          </div>

          {/* Section 2: AI Provider Presets */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wide">
              เลือก AI สำหรับวางแผน (Planning AI Provider)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Google Gemini */}
              <button
                type="button"
                onClick={() => handleSelectPreset('gemini')}
                className={clsx(
                  'p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5',
                  activeAi === 'gemini'
                    ? 'border-blue-500 bg-blue-950/40 shadow-md shadow-blue-950/50'
                    : 'border-gray-800 bg-gray-950/40 hover:border-gray-700 text-gray-400'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-gray-100">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    Google Gemini
                  </div>
                  {activeAi === 'gemini' && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_#60a5fa]" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-mono text-blue-300 font-medium truncate">gemini-2.5-flash</p>
                  <p className="text-[10px] text-emerald-400 font-medium mt-0.5">✓ แนะนำ (ฟรี & แม่นยำ)</p>
                </div>
              </button>

              {/* OpenAI (GPT) */}
              <button
                type="button"
                onClick={() => handleSelectPreset('openai')}
                className={clsx(
                  'p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5',
                  activeAi === 'openai'
                    ? 'border-emerald-500 bg-emerald-950/30 shadow-md shadow-emerald-950/50'
                    : 'border-gray-800 bg-gray-950/40 hover:border-gray-700 text-gray-400'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-gray-100">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    OpenAI GPT
                  </div>
                  {activeAi === 'openai' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-mono text-emerald-300 font-medium truncate">gpt-4o-mini</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">มาตรฐาน OpenAI</p>
                </div>
              </button>

              {/* Groq Cloud */}
              <button
                type="button"
                onClick={() => handleSelectPreset('groq')}
                className={clsx(
                  'p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5',
                  activeAi === 'groq'
                    ? 'border-amber-500 bg-amber-950/40 shadow-md shadow-amber-950/50'
                    : 'border-gray-800 bg-gray-950/40 hover:border-gray-700 text-gray-400'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-gray-100">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Groq Cloud
                  </div>
                  {activeAi === 'groq' && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-mono text-amber-300 font-medium truncate">llama-3.3-70b</p>
                  <p className="text-[10px] text-amber-400 font-medium mt-0.5">⚡ เร็วพิเศษ & โควต้าฟรี</p>
                </div>
              </button>

              {/* Ollama (Local) */}
              <button
                type="button"
                onClick={() => handleSelectPreset('ollama')}
                className={clsx(
                  'p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5',
                  activeAi === 'ollama'
                    ? 'border-purple-500 bg-purple-950/40 shadow-md shadow-purple-950/50'
                    : 'border-gray-800 bg-gray-950/40 hover:border-gray-700 text-gray-400'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-gray-100">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    Ollama (Local)
                  </div>
                  {activeAi === 'ollama' && (
                    <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_6px_#c084fc]" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-mono text-purple-300 font-medium truncate">qwen2.5-coder:7b</p>
                  <p className="text-[10px] text-purple-300 font-medium mt-0.5">🔒 ออฟไลน์ 100%</p>
                </div>
              </button>
            </div>
          </div>

          {/* Section 3: Configuration Fields for Selected AI */}
          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-gray-200 flex items-center justify-between">
              <span>พารามิเตอร์ของ AI Planner</span>
              <span className="text-[11px] text-blue-400 font-medium">
                {activeAi === 'gemini' && 'Google Gemini'}
                {activeAi === 'openai' && 'OpenAI GPT'}
                {activeAi === 'groq' && 'Groq (Llama 3.3)'}
                {activeAi === 'ollama' && 'Ollama (Local)'}
                {activeAi === 'custom' && 'กำหนดเอง (Custom)'}
              </span>
            </h3>

            {/* API Key Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-300">
                  {activeAi === 'ollama' ? 'API Key (ไม่จำเป็นสำหรับ Ollama)' : 'API Key'}
                </label>
                {settings?.ai_api_key_masked && (
                  <span className="text-[10px] text-gray-500 font-mono">
                    บันทึกแล้ว: {settings.ai_api_key_masked}
                  </span>
                )}
              </div>
              <ApiKeyInput
                value={apiKey}
                onChange={setApiKey}
                placeholder={
                  activeAi === 'gemini'
                    ? 'AQ.Ab8RN6K9... (Gemini Key)'
                    : activeAi === 'groq'
                    ? 'gsk_... (Groq Key)'
                    : activeAi === 'ollama'
                    ? 'ollama (เครื่องตนเองไม่ต้องใส่)'
                    : 'sk-proj-... (OpenAI Key)'
                }
              />
            </div>

            {/* Model Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Model Name</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                placeholder={
                  activeAi === 'gemini'
                    ? 'gemini-2.5-flash'
                    : activeAi === 'groq'
                    ? 'llama-3.3-70b-versatile'
                    : activeAi === 'ollama'
                    ? 'qwen2.5-coder:7b'
                    : 'gpt-4o-mini'
                }
              />
            </div>

            {/* Base URL */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Endpoint Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Section 4: Builder Integration Section */}
          <div className="border-t border-gray-800 pt-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide flex items-center justify-between">
              <span>Builder Agent (ตัวเขียนโค้ดอัตโนมัติ)</span>
              <span className="text-[10px] text-emerald-400 font-mono font-medium">Antigravity</span>
            </h3>

            <div className="bg-gray-950/40 border border-gray-800 rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">สถานะโปรแกรม:</span>
                <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  {builderCapabilities?.installed ? 'พร้อมใช้งาน (Detected)' : 'Manual Fallback'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">วิธีส่งงาน:</span>
                <span className="text-gray-300 font-mono text-[11px]">Mode B — Assisted Handoff</span>
              </div>
              {builderCapabilities?.executable_path && (
                <div className="pt-1 border-t border-gray-800/60 text-[10px] text-gray-500 truncate font-mono">
                  Path: {builderCapabilities.executable_path}
                </div>
              )}
            </div>
          </div>

          {/* Connection Test Result Box */}
          {connectionStatus?.tested && (
            <div
              className={clsx(
                'flex items-center gap-2.5 px-3.5 py-3 rounded-lg border text-xs',
                connectionStatus.success
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                  : 'border-red-500/40 bg-red-950/30 text-red-300'
              )}
            >
              {connectionStatus.success ? (
                <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span className="leading-tight">{connectionStatus.message}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center gap-3 bg-gray-950/40 shrink-0">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors disabled:opacity-50"
          >
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            {testMutation.isPending ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 shadow-md shadow-blue-950"
          >
            <Check className="w-4 h-4" />
            {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
        </div>
      </div>
    </div>
  )
}
