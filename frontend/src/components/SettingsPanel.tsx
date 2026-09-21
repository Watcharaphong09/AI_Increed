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

  // Active planning AI choice: 'gemini' | 'openai'
  const [activeAi, setActiveAi] = useState<'gemini' | 'openai'>('gemini')

  // Form states
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
      const currentBaseUrl = settings.ai_base_url || settings.base_url || ''
      const currentModel = settings.ai_model || settings.model || ''
      const isGemini =
        currentBaseUrl.includes('googleapis') ||
        currentModel.toLowerCase().includes('gemini') ||
        (settings.planner_base_url && settings.planner_base_url.includes('googleapis'))

      if (isGemini) {
        setActiveAi('gemini')
        setBaseUrl(currentBaseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/')
        setModel(currentModel || 'gemini-2.5-flash')
        setApiKey(settings.ai_api_key_masked || settings.api_key || '')
      } else {
        setActiveAi('openai')
        setBaseUrl(currentBaseUrl || 'https://api.openai.com/v1')
        setModel(currentModel || 'gpt-4o-mini')
        setApiKey(settings.ai_api_key_masked || settings.api_key || '')
      }
    }
  }, [settings])

  // Presets switcher
  const handleSelectPreset = (preset: 'gemini' | 'openai') => {
    setActiveAi(preset)
    setConnectionStatus(null)

    if (preset === 'gemini') {
      setBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai/')
      setModel('gemini-2.5-flash')
      // If switching to gemini and apiKey currently looks like openai key, clear it or keep if gemini
      if (apiKey.startsWith('sk-')) {
        setApiKey('')
      }
    } else {
      setBaseUrl('https://api.openai.com/v1')
      setModel('gpt-4o-mini')
      if (apiKey.startsWith('AQ.')) {
        setApiKey('')
      }
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
    const data: any = {
      ai_provider: 'openai', // Both Gemini and OpenAI use the OpenAI-compatible endpoint
      ai_base_url: baseUrl.trim(),
      ai_model: model.trim(),
      planner_provider: 'openai',
      planner_base_url: baseUrl.trim(),
      planner_model: model.trim(),
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
      <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-800 h-full flex flex-col shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/40 shrink-0">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-gray-100">ตั้งค่า AI Planner</h2>
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
              API Key จะถูกบันทึกไว้ในไฟล์ <code className="text-white font-mono">.env</code> ภายในเครื่องของคุณเท่านั้น ปลอดภัย ไม่มีการส่งออกภายนอก
            </span>
          </div>

          {/* AI Selection Cards: Gemini vs GPT */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wide">
              เลือก AI สำหรับวางแผน (Planning AI)
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Google Gemini Card */}
              <button
                type="button"
                onClick={() => handleSelectPreset('gemini')}
                className={clsx(
                  'p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5',
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
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-mono text-blue-300 font-medium">gemini-2.5-flash</p>
                  <p className="text-[10px] text-emerald-400 font-medium mt-0.5">✓ แนะนำ (ใช้งานได้ทันที)</p>
                </div>
              </button>

              {/* OpenAI (GPT) Card */}
              <button
                type="button"
                onClick={() => handleSelectPreset('openai')}
                className={clsx(
                  'p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5',
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
                  <p className="text-[11px] font-mono text-emerald-300 font-medium">gpt-4o-mini</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">ใช้เครดิตบัญชี OpenAI</p>
                </div>
              </button>
            </div>
          </div>

          {/* Configuration Fields for Selected AI */}
          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
              <span>ตั้งค่าพารามิเตอร์ของ</span>
              <span className="text-blue-400">
                {activeAi === 'gemini' ? 'Google Gemini' : 'OpenAI GPT'}
              </span>
            </h3>

            {/* API Key Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-300">API Key</label>
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
                placeholder={activeAi === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'}
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

          {/* Builder Integration Section */}
          <div className="border-t border-gray-800 pt-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide flex items-center justify-between">
              <span>Builder Agent (ตัวเขียนโค้ด)</span>
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
