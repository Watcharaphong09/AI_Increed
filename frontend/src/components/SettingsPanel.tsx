import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Wifi, WifiOff, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { getSettings, updateSettings, testConnection } from '../api/settings'
import type { AIProvider, Settings } from '../types'

const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'groq', label: 'Groq' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama (Local)' },
]

interface ApiKeyInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}

function ApiKeyInput({ value, onChange, placeholder, disabled }: ApiKeyInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full text-sm pr-10"
        placeholder={placeholder ?? 'sk-...'}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

export default function SettingsPanel() {
  const { showSettings, setShowSettings, showToast } = useAppStore()

  const [provider, setProvider] = useState<AIProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [showPlannerOverride, setShowPlannerOverride] = useState(false)
  const [plannerModel, setPlannerModel] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean
    success: boolean
    message: string
  } | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: showSettings,
    retry: false,
  })

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider)
      setApiKey(settings.api_key)
      setBaseUrl(settings.base_url)
      setModel(settings.model)
      setPlannerModel(settings.planner_override?.model ?? '')
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Settings>) => updateSettings(data),
    onSuccess: () => {
      showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success')
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
    },
  })

  const testMutation = useMutation({
    mutationFn: testConnection,
    onSuccess: (result) => {
      setConnectionStatus({ tested: true, success: result.success, message: result.message })
    },
    onError: (err: Error) => {
      setConnectionStatus({ tested: true, success: false, message: err.message })
    },
  })

  const handleSave = () => {
    const data: Partial<Settings> = {
      provider,
      api_key: apiKey,
      base_url: baseUrl,
      model,
    }
    if (plannerModel) {
      data.planner_override = { model: plannerModel }
    }
    saveMutation.mutate(data)
  }

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setShowSettings(false)}
      />

      {/* Panel */}
      <div className="relative w-96 bg-gray-900 border-l border-gray-800 h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-gray-100">ตั้งค่า AI</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Security warning */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-yellow-950/30 border border-yellow-500/30">
            <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-200/80 leading-relaxed">
              API Key ไม่ถูกบันทึกลงใน .md files และจะถูก mask หลังจากบันทึกแล้ว
            </p>
          </div>

          {/* Provider */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProvider(p.value)}
                  className={clsx(
                    'px-3 py-2 text-sm rounded-lg border transition-all',
                    provider === p.value
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300 bg-gray-800/40'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          {provider !== 'ollama' && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">API Key</label>
              <ApiKeyInput
                value={apiKey}
                onChange={setApiKey}
                placeholder={provider === 'azure' ? 'Azure API Key...' : 'sk-...'}
              />
            </div>
          )}

          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">
              Base URL{' '}
              <span className="text-gray-600 font-normal">
                {provider === 'ollama' ? '(localhost:11434)' : '(ไม่บังคับ)'}
              </span>
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="input-field w-full text-sm"
              placeholder={
                provider === 'ollama'
                  ? 'http://localhost:11434'
                  : provider === 'azure'
                  ? 'https://your-resource.openai.azure.com'
                  : 'https://api.openai.com/v1'
              }
            />
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input-field w-full text-sm"
              placeholder={
                provider === 'openai'
                  ? 'gpt-4o'
                  : provider === 'groq'
                  ? 'llama-3.1-70b-versatile'
                  : provider === 'ollama'
                  ? 'llama3.2'
                  : 'gpt-4'
              }
            />
          </div>

          {/* Divider */}
          <div className="border-t border-gray-800" />

          {/* Per-role overrides (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowPlannerOverride((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-medium text-gray-400 hover:text-gray-300 transition-colors"
            >
              <span>Override สำหรับแต่ละ Role</span>
              {showPlannerOverride ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>

            {showPlannerOverride && (
              <div className="mt-3 space-y-3 pl-3 border-l border-gray-800">
                <p className="text-xs text-gray-500">
                  ตั้งค่า model แตกต่างสำหรับ Planner และ Reviewer
                </p>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-gray-400">
                    Planner Model
                  </label>
                  <input
                    type="text"
                    value={plannerModel}
                    onChange={(e) => setPlannerModel(e.target.value)}
                    className="input-field w-full text-sm"
                    placeholder="เช่น gpt-4o (ใช้ default ถ้าว่าง)"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Antigravity Integration Section (Section 34) */}
          <div className="pt-2 border-t border-gray-800 space-y-3">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide flex items-center justify-between">
              <span>Antigravity & Builder Integration</span>
              <span className="text-[10px] text-blue-400 font-mono font-normal">v1.0 Local</span>
            </h3>

            <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Installation Status:</span>
                <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  Detected (Localhost)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Integration Method:</span>
                <span className="text-gray-200 font-mono text-[11px]">Application Launch & Workspace Open</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Default Handoff:</span>
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[11px] font-semibold">
                  Mode B — Assisted Handoff
                </span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed">
              เมื่อส่งงาน Task ไปยัง Antigravity ระบบจะสร้าง <code className="text-gray-400">.handoff/TASK-xxx/</code> พร้อม Context Manifest เฉพาะที่จำเป็น โดยไม่มี Conversation History ปนเปื้อน
            </p>
          </div>

          {/* Connection test result */}
          {connectionStatus?.tested && (
            <div
              className={clsx(
                'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm',
                connectionStatus.success
                  ? 'border-green-500/40 bg-green-950/30 text-green-300'
                  : 'border-red-500/40 bg-red-950/30 text-red-300'
              )}
            >
              {connectionStatus.success ? (
                <Wifi className="w-4 h-4 shrink-0" />
              ) : (
                <WifiOff className="w-4 h-4 shrink-0" />
              )}
              <span className="text-xs">{connectionStatus.message}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-gray-800 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <Wifi className="w-4 h-4" />
            {testMutation.isPending ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-primary text-sm flex-1"
          >
            {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
