import { useState } from 'react'
import { CheckCircle, X, FileText, Check, Zap } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitBuildResult } from '../api/handoff'
import { useAppStore } from '../store/appStore'
import type { Task, BuildResultSubmission } from '../types'

/**
 * Terminal Output Pruner (GODKILLER-ZERO §2.3)
 * Strips ANSI escape codes, collapses framework stack traces, and removes repetitive noise.
 */
function pruneTerminalLog(raw: string): string {
  if (!raw.trim()) return ''
  // 1. Remove ANSI escape codes
  let text = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

  const lines = text.split('\n')
  const pruned: string[] = []
  let frameworkCount = 0

  const isFrameworkLine = (line: string) => {
    const l = line.toLowerCase().trim()
    return (
      l.includes('node_modules') ||
      l.includes('node:internal') ||
      l.includes('site-packages') ||
      l.includes('dist-packages') ||
      l.includes('<frozen ') ||
      l.startsWith('at microsoft.') ||
      l.startsWith('at system.')
    )
  }

  for (const line of lines) {
    if (isFrameworkLine(line)) {
      frameworkCount++
    } else {
      if (frameworkCount > 0) {
        pruned.push(`... [${frameworkCount} framework stack frames collapsed] ...`)
        frameworkCount = 0
      }
      pruned.push(line)
    }
  }
  if (frameworkCount > 0) {
    pruned.push(`... [${frameworkCount} framework stack frames collapsed] ...`)
  }

  return pruned.join('\n')
}

interface BuildResultModalProps {
  task: Task
  projectId: string
  onClose: () => void
}

export default function BuildResultModal({
  task,
  projectId,
  onClose,
}: BuildResultModalProps) {
  const { showToast } = useAppStore()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<string>('COMPLETED')
  const [changedFilesText, setChangedFilesText] = useState<string>('')
  const [testsStatus, setTestsStatus] = useState<string>('Build: PASS\nTypecheck: PASS')
  const [notes, setNotes] = useState<string>('')
  const [rawMarkdown, setRawMarkdown] = useState<string>('')
  const [useRawMarkdown, setUseRawMarkdown] = useState<boolean>(false)

  const resultMutation = useMutation({
    mutationFn: (data: BuildResultSubmission) =>
      submitBuildResult(projectId, task.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      showToast(
        `บันทึกผลลัพธ์ TASK-${task.task_number.toString().padStart(3, '0')} สำเร็จ! อัปเดต STATE.md และ CHANGELOG แล้ว`,
        'success'
      )
      onClose()
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || err.message || 'บันทึกผลลัพธ์ไม่สำเร็จ', 'error')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const changed_files = changedFilesText
      .split('\n')
      .map((line) => line.trim().replace(/^-\s*/, ''))
      .filter(Boolean)

    // GODKILLER-ZERO §3.6: Done != Evidence Guard
    if (status === 'COMPLETED') {
      if (!useRawMarkdown && changed_files.length === 0) {
        showToast('Done ≠ Evidence: กรุณาระบุไฟล์ที่มีการแก้ไข (Changed Files) อย่างน้อย 1 ไฟล์', 'error')
        return
      }
      if (useRawMarkdown && !rawMarkdown.trim()) {
        showToast('Done ≠ Evidence: กรุณากรอกรายละเอียดผลการรัน/ทดสอบใน Raw Markdown', 'error')
        return
      }
    }

    resultMutation.mutate({
      status,
      changed_files,
      tests_status: testsStatus,
      notes,
      raw_markdown: useRawMarkdown ? rawMarkdown : '',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/40">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-gray-100">
              บันทึกผลลัพธ์จาก Builder (TASK-{task.task_number.toString().padStart(3, '0')})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
          {/* Status Selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              สถานะผลลัพธ์ (Build Status)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'COMPLETED', label: 'COMPLETED (สำเร็จ)', color: 'emerald' },
                { id: 'CHANGES_REQUIRED', label: 'CHANGES_REQUIRED', color: 'amber' },
                { id: 'FAILED', label: 'FAILED (ล้มเหลว)', color: 'red' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setStatus(opt.id)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-colors ${
                    status === opt.id
                      ? opt.color === 'emerald'
                        ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300 font-semibold'
                        : opt.color === 'amber'
                        ? 'border-amber-500 bg-amber-950/50 text-amber-300 font-semibold'
                        : 'border-red-500 bg-red-950/50 text-red-300 font-semibold'
                      : 'border-gray-800 bg-gray-950/40 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle between structured form and raw markdown */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-400">
              {useRawMarkdown ? 'ป้อน Markdown ตรงๆ' : 'ฟอร์มแบบมีโครงสร้าง'}
            </span>
            <button
              type="button"
              onClick={() => setUseRawMarkdown(!useRawMarkdown)}
              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              {useRawMarkdown ? 'สลับไปใช้ฟอร์ม' : 'สลับไปป้อน Markdown'}
            </button>
          </div>

          {!useRawMarkdown ? (
            <>
              {/* Changed Files */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  ไฟล์ที่มีการแก้ไข (Changed Files — บรรทัดละ 1 ไฟล์)
                </label>
                <textarea
                  value={changedFilesText}
                  onChange={(e) => setChangedFilesText(e.target.value)}
                  placeholder="src/components/VideoSection.tsx&#10;src/components/AudioPlayer.tsx"
                  rows={3}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500 placeholder-gray-600"
                />
              </div>

              {/* Tests */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-300">
                    ผลการทดสอบ (Tests Result)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const pruned = pruneTerminalLog(testsStatus)
                      setTestsStatus(pruned)
                      showToast('ตัดทอน Framework Noise เรียบร้อย ⚡', 'info')
                    }}
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    title="ตัดทอน framework stack trace และ terminal noise ตาม GODKILLER-ZERO §2.3"
                  >
                    <Zap className="w-3 h-3" />
                    ย่อ Log (Pruner)
                  </button>
                </div>
                <input
                  type="text"
                  value={testsStatus}
                  onChange={(e) => setTestsStatus(e.target.value)}
                  placeholder="Build: PASS, Typecheck: PASS"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  สรุปผลหรือหมายเหตุ (Notes / Changelog Summary)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เพิ่มระบบ Audio ให้เล่นเมื่อ YouTube วิดีโอจบเรียบร้อยแล้ว ไม่เล่นก่อนกำหนด"
                  rows={2}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                />
              </div>
            </>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-300">
                  Raw Result Markdown
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const pruned = pruneTerminalLog(rawMarkdown)
                    setRawMarkdown(pruned)
                    showToast('ตัดทอน Framework Noise เรียบร้อย ⚡', 'info')
                  }}
                  className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  title="ตัดทอน framework stack trace และ terminal noise ตาม GODKILLER-ZERO §2.3"
                >
                  <Zap className="w-3 h-3" />
                  ย่อ Log (Pruner)
                </button>
              </div>
              <textarea
                value={rawMarkdown}
                onChange={(e) => setRawMarkdown(e.target.value)}
                placeholder="# Build Result&#10;&#10;Task: TASK-001&#10;Status: COMPLETED&#10;&#10;## Changed Files&#10;- src/app.tsx"
                rows={9}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500 placeholder-gray-600"
              />
            </div>
          )}

          {/* Sync Notice */}
          <div className="bg-gray-950/40 border border-gray-800 rounded-lg p-3 text-xs text-gray-400">
            <span className="text-gray-300 font-medium">ระบบจะดำเนินการอัตโนมัติ:</span>
            <ul className="mt-1 space-y-0.5 list-disc list-inside text-gray-400 text-[11px]">
              <li>สร้างไฟล์ <code className="text-blue-400 font-mono">tasks/results/TASK-{task.task_number.toString().padStart(3, '0')}.result.md</code></li>
              <li>อัปเดตสถานะใน <code className="text-blue-400 font-mono">STATE.md</code> และเพิ่มใน <code className="text-blue-400 font-mono">CHANGELOG.md</code></li>
              <li>ปลดล็อค Task (.lock) และปรับปรุงสถานะในฐานข้อมูล</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={resultMutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 shadow-lg shadow-emerald-950"
            >
              <Check className="w-4 h-4" />
              {resultMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกผลลัพธ์'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
