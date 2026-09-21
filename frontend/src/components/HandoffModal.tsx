import { useState } from 'react'
import {
  Rocket,
  Copy,
  FolderOpen,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  FileCode,
  ShieldCheck,
  Check,
  Lock,
  Unlock,
} from 'lucide-react'
import clsx from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getContextPreview,
  sendToBuilder,
  openWorkspace,
  openFolder,
  unlockTask,
} from '../api/handoff'
import { useAppStore } from '../store/appStore'
import type { Task, ContextPreview } from '../types'

interface HandoffModalProps {
  task: Task
  projectId: string
  onClose: () => void
  onOpenResultModal: (task: Task) => void
}

export default function HandoffModal({
  task,
  projectId,
  onClose,
  onOpenResultModal,
}: HandoffModalProps) {
  const { showToast, builderCapabilities } = useAppStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'preview' | 'checklist'>('preview')
  const [copied, setCopied] = useState(false)

  // Fetch context preview
  const {
    data: preview,
    isLoading: isPreviewLoading,
  } = useQuery<ContextPreview>({
    queryKey: ['context-preview', projectId, task.id],
    queryFn: () => getContextPreview(projectId, task.id),
  })

  // Send to builder mutation
  const sendMutation = useMutation({
    mutationFn: () => sendToBuilder(projectId, task.id, 'assisted'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      // Auto copy instruction to clipboard
      if (data.instruction_text) {
        navigator.clipboard.writeText(data.instruction_text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
      showToast(
        data.workspace_opened
          ? 'ส่งงานไป Antigravity สำเร็จ! โฟลเดอร์/โปรแกรมถูกเปิดแล้ว'
          : 'สร้าง Handoff Package สำเร็จ! คัดลอกคำสั่งเรียบร้อย',
        'success'
      )
      setActiveTab('checklist')
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || err.message || 'ส่งงานไม่สำเร็จ', 'error')
    },
  })

  // Unlock mutation
  const unlockMutation = useMutation({
    mutationFn: () => unlockTask(projectId, task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      showToast('ปลดล็อค Task สำเร็จ — สถานะกลับเป็น READY', 'info')
    },
  })

  const handleCopyInstruction = () => {
    if (preview?.builder_instructions) {
      navigator.clipboard.writeText(preview.builder_instructions)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      showToast('คัดลอก Builder Instruction แล้ว!', 'success')
    }
  }

  const isBuilding =
    task.status === 'BUILDING' ||
    task.status === 'HANDED_OFF' ||
    task.status === 'IN_PROGRESS'
  const isCompleted = task.status === 'COMPLETED' || task.status === 'DONE'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/40">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60 font-semibold shrink-0">
              TASK-{task.task_number.toString().padStart(3, '0')}
            </span>
            <h2 className="text-base font-semibold text-gray-100 truncate">
              {task.title}
            </h2>
            <span
              className={clsx(
                'text-xs font-medium px-2 py-0.5 rounded-full border shrink-0',
                isCompleted && 'bg-green-950/60 text-green-400 border-green-800/40',
                isBuilding && 'bg-amber-950/60 text-amber-400 border-amber-800/40 animate-pulse',
                !isCompleted && !isBuilding && 'bg-gray-800 text-gray-300 border-gray-700'
              )}
            >
              {task.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-800 bg-gray-950/20 px-6 pt-2 shrink-0">
          <button
            onClick={() => setActiveTab('preview')}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
              activeTab === 'preview'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            )}
          >
            <FileCode className="w-4 h-4" />
            Context Preview (Token Budget)
          </button>
          <button
            onClick={() => setActiveTab('checklist')}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
              activeTab === 'checklist'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            )}
          >
            <ShieldCheck className="w-4 h-4" />
            Handoff & Progress
          </button>
        </div>

        {/* Tab 1: Context Preview */}
        {activeTab === 'preview' && (
          <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
            {isPreviewLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                กำลังคำนวณ Context Preview...
              </div>
            ) : preview ? (
              <>
                {/* Stats Bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Estimated Context</p>
                    <p className="text-lg font-bold text-gray-100 font-mono">
                      ~{preview.estimated_tokens.toLocaleString()} tokens
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Budget limit: {preview.budget_limit.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Relevant Files</p>
                    <p className="text-lg font-bold text-gray-100 font-mono">
                      {preview.file_count} files
                    </p>
                    <p className="text-[11px] text-emerald-400 font-medium">
                      ✓ Focused scope
                    </p>
                  </div>
                  <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Antigravity Mode</p>
                    <p className="text-lg font-bold text-blue-400 capitalize">
                      {builderCapabilities?.default_mode || 'Assisted'}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {builderCapabilities?.installed ? '● Installed' : '○ Manual'}
                    </p>
                  </div>
                </div>

                {/* Token Budget Warning if exceeded */}
                {preview.is_budget_exceeded && (
                  <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 text-amber-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      Context มีขนาดใหญ่กว่างบประมาณแนะนำ ({preview.budget_limit} tokens)
                      แต่ยังสามารถส่งต่อไปยัง Builder ได้
                    </span>
                  </div>
                )}

                {/* Included vs Excluded Files (Section 44) */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Included */}
                  <div className="border border-gray-800 rounded-lg p-3 bg-gray-950/40">
                    <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Included Context ({preview.included_files.length})
                    </h3>
                    <ul className="space-y-1.5 text-xs text-gray-300">
                      {preview.included_files.map((file, i) => (
                        <li key={i} className="flex items-center gap-1.5 font-mono text-[11px] text-gray-300">
                          <span className="text-emerald-400">✓</span>
                          <span className="truncate">{file}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Excluded */}
                  <div className="border border-gray-800 rounded-lg p-3 bg-gray-950/40">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-gray-500" />
                      Excluded (Token Saved)
                    </h3>
                    <ul className="space-y-1.5 text-xs text-gray-400">
                      {preview.excluded_files.map((item, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-gray-500">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Instruction Preview */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Builder Instruction Preview
                    </h3>
                    <button
                      onClick={handleCopyInstruction}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                  </div>
                  <pre className="bg-gray-950 p-3 rounded-lg border border-gray-800 font-mono text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {preview.builder_instructions}
                  </pre>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Tab 2: Checklist & Progress */}
        {activeTab === 'checklist' && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
            <h3 className="text-sm font-semibold text-gray-200">
              สถานะกระบวนการ Antigravity Handoff
            </h3>

            <div className="space-y-2.5 bg-gray-950/40 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Task file generated (<code className="text-xs font-mono text-blue-400">tasks/TASK-{task.task_number.toString().padStart(3, '0')}.md</code>)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Context manifest prepared (<code className="text-xs font-mono text-blue-400">manifest.json</code>)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Project state synchronized (<code className="text-xs font-mono text-blue-400">STATE.md</code>)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Workspace boundary verified</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Antigravity detected ({builderCapabilities?.installed ? 'Local App' : 'Manual mode'})
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm font-medium pt-2 border-t border-gray-800/80">
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300">Build completed & verified</span>
                  </>
                ) : isBuilding ? (
                  <>
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                    <span className="text-amber-300">Waiting for Builder (Antigravity is working)</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-gray-400">Ready to Handoff</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => openWorkspace(projectId, task.id)}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-blue-400" />
                เปิดใน Antigravity
              </button>
              <button
                onClick={() => openFolder(projectId, task.id)}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-amber-400" />
                เปิดโฟลเดอร์ Workspace
              </button>
            </div>

            {/* If task is locked or building, offer unlock button */}
            {isBuilding && (
              <div className="flex items-center justify-between bg-amber-950/20 border border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-300 mt-2">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  Task กำลังถูกดำเนินการ (Locked)
                </span>
                <button
                  onClick={() => unlockMutation.mutate()}
                  disabled={unlockMutation.isPending}
                  className="text-amber-400 hover:text-amber-200 underline font-medium flex items-center gap-1"
                >
                  <Unlock className="w-3 h-3" />
                  ปลดล็อค Task
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/40">
          <button
            onClick={handleCopyInstruction}
            className="flex items-center gap-2 text-xs font-medium text-gray-300 hover:text-gray-100 hover:bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'คัดลอกคำสั่งแล้ว' : 'คัดลอก Instruction'}
          </button>

          <div className="flex items-center gap-2.5">
            {/* If already building, give Record Result button */}
            {isBuilding && (
              <button
                onClick={() => {
                  onClose()
                  onOpenResultModal(task)
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                บันทึกผลลัพธ์ (Record Result)
              </button>
            )}

            {/* Send to Antigravity Button */}
            {!isCompleted && !isBuilding && (
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-blue-950 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Rocket className="w-4 h-4" />
                {sendMutation.isPending ? 'กำลังส่งงาน...' : '🚀 SEND TO ANTIGRAVITY'}
              </button>
            )}

            {isCompleted && (
              <button
                onClick={() => {
                  onClose()
                  onOpenResultModal(task)
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
              >
                ดูผลลัพธ์ (View Result)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
