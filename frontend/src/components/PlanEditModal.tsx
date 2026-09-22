import { useState, useEffect } from 'react'
import {
  X,
  Edit3,
  RefreshCw,
  CheckCircle,
  Circle,
  ChevronRight,
  Layers,
  AlertTriangle,
  Rocket,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useAppStore } from '../store/appStore'
import { getRequirements, updateRequirement, generatePlan } from '../api/planner'
import { listTasks } from '../api/tasks'
import type { Requirement, Task } from '../types'

const STATUS_OPTIONS = ['PROPOSED', 'CONFIRMED', 'DEFAULTED', 'REJECTED'] as const
type ReqStatus = (typeof STATUS_OPTIONS)[number]

function statusColor(status: string): string {
  switch (status) {
    case 'CONFIRMED':
    case 'DEFAULTED':
      return 'text-emerald-400 border-emerald-700/50 bg-emerald-950/30'
    case 'PROPOSED':
      return 'text-yellow-400 border-yellow-700/50 bg-yellow-950/20'
    case 'REJECTED':
      return 'text-red-400 border-red-700/50 bg-red-950/20'
    default:
      return 'text-gray-400 border-gray-700 bg-gray-800/40'
  }
}

interface RequirementRowProps {
  req: Requirement
  onStatusChange: (id: string, status: ReqStatus) => void
  onContentChange: (id: string, content: string) => void
  saving: boolean
}

function RequirementRow({ req, onStatusChange, onContentChange, saving }: RequirementRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(req.content)

  const handleSave = () => {
    if (draft.trim() !== req.content) {
      onContentChange(req.id, draft.trim())
    }
    setEditing(false)
  }

  return (
    <div
      className={clsx(
        'p-3 rounded-lg border transition-all',
        statusColor(req.status)
      )}
    >
      <div className="flex items-start gap-2">
        {/* Status icon */}
        {req.status === 'CONFIRMED' || req.status === 'DEFAULTED' ? (
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
        ) : (
          <Circle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
              {req.category}
            </span>
            {/* Status selector */}
            <select
              value={req.status}
              onChange={(e) => onStatusChange(req.id, e.target.value as ReqStatus)}
              disabled={saving}
              className="text-[10px] bg-transparent border border-current/30 rounded px-1 py-0 cursor-pointer focus:outline-none opacity-80 hover:opacity-100"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-gray-900 text-gray-200">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {editing ? (
            <div className="space-y-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full text-xs bg-gray-950 border border-gray-700 rounded p-1.5 text-gray-100 resize-none focus:outline-none focus:border-blue-500"
                rows={2}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded"
                >
                  บันทึก
                </button>
                <button
                  onClick={() => { setDraft(req.content); setEditing(false) }}
                  className="text-[10px] px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-200 leading-relaxed text-left hover:text-white w-full group flex items-start gap-1"
            >
              <span className="flex-1">{req.content}</span>
              <Edit3 className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-50" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlanEditModal() {
  const { currentProject, showPlanEdit, setShowPlanEdit, showToast, setTasks } = useAppStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'requirements' | 'plan'>('requirements')
  const [savingId, setSavingId] = useState<string | null>(null)

  // Fetch requirements
  const { data: requirements = [] } = useQuery({
    queryKey: ['requirements', currentProject?.id],
    queryFn: () => getRequirements(currentProject!.id),
    enabled: !!currentProject && showPlanEdit,
  })

  // Fetch current plan tasks
  const { data: planTasks = [], refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ['tasks', currentProject?.id],
    queryFn: () => listTasks(currentProject!.id),
    enabled: !!currentProject && showPlanEdit,
  })

  // Sync tasks to global store
  useEffect(() => {
    if (planTasks.length > 0) setTasks(planTasks)
  }, [planTasks, setTasks])

  // Update requirement status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateRequirement(currentProject!.id, id, { status: status as any }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', currentProject?.id] })
      setSavingId(null)
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
      setSavingId(null)
    },
  })

  // Update requirement content mutation
  const updateContentMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateRequirement(currentProject!.id, id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', currentProject?.id] })
      setSavingId(null)
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
      setSavingId(null)
    },
  })

  // Generate plan mutation
  const generateMutation = useMutation({
    mutationFn: () => generatePlan(currentProject!.id),
    onSuccess: () => {
      refetchTasks()
      queryClient.invalidateQueries({ queryKey: ['tasks', currentProject?.id] })
      showToast('สร้าง Plan ใหม่เรียบร้อยแล้ว!', 'success')
      setActiveTab('plan')
    },
    onError: (err: Error) => {
      showToast(err.message || 'สร้าง Plan ไม่สำเร็จ', 'error')
    },
  })

  const handleStatusChange = (id: string, status: string) => {
    setSavingId(id)
    updateStatusMutation.mutate({ id, status })
  }

  const handleContentChange = (id: string, content: string) => {
    setSavingId(id)
    updateContentMutation.mutate({ id, content })
  }

  if (!showPlanEdit || !currentProject) return null

  const confirmedCount = requirements.filter(
    (r) => r.status === 'CONFIRMED' || r.status === 'DEFAULTED'
  ).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/40">
          <div className="flex items-center gap-3">
            <Edit3 className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-semibold text-gray-100">แก้ไข Plan</h2>
              <p className="text-xs text-gray-500">{currentProject.name}</p>
            </div>
          </div>
          <button
            onClick={() => setShowPlanEdit(false)}
            className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-800 bg-gray-950/20 px-6 pt-2 shrink-0">
          <button
            onClick={() => setActiveTab('requirements')}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
              activeTab === 'requirements'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            )}
          >
            <CheckCircle className="w-4 h-4" />
            Requirements ({confirmedCount}/{requirements.length} ยืนยัน)
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
              activeTab === 'plan'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            )}
          >
            <Layers className="w-4 h-4" />
            Tasks & Plan ({planTasks.length} tasks)
          </button>
        </div>

        {/* Tab 1: Requirements */}
        {activeTab === 'requirements' && (
          <div className="p-4 overflow-y-auto flex-1 space-y-2">
            {requirements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                <Circle className="w-10 h-10 text-gray-700" />
                <p className="text-sm text-gray-500">ยังไม่มี Requirements</p>
                <p className="text-xs text-gray-600">คุยกับ Planner ในแท็บ Chat ก่อน</p>
              </div>
            ) : (
              requirements.map((req) => (
                <RequirementRow
                  key={req.id}
                  req={req}
                  onStatusChange={handleStatusChange}
                  onContentChange={handleContentChange}
                  saving={savingId === req.id}
                />
              ))
            )}
          </div>
        )}

        {/* Tab 2: Plan Tasks */}
        {activeTab === 'plan' && (
          <div className="p-4 overflow-y-auto flex-1 space-y-3">
            {planTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                <Layers className="w-10 h-10 text-gray-700" />
                <p className="text-sm text-gray-500">ยังไม่มี Tasks</p>
                <p className="text-xs text-gray-600">กด "สร้าง Plan ใหม่" ด้านล่างเพื่อ generate</p>
              </div>
            ) : (
              planTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 rounded-lg border border-gray-800 bg-gray-950/40 flex items-start gap-3"
                >
                  <span className="font-mono text-xs font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/60 shrink-0 mt-0.5">
                    TASK-{task.task_number.toString().padStart(3, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-100 leading-snug">{task.title}</p>
                    {task.goal && (
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{task.goal}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    <span className="text-xs text-gray-500">{task.status}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 shrink-0 bg-gray-950/40">
          {/* Hoare Contract hint — GODKILLER §3.2 */}
          <div className="flex items-start gap-2 mb-3 text-[11px] text-gray-600 bg-gray-800/30 border border-gray-800 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-600" />
            <span>
              <strong className="text-gray-500">Done ≠ Evidence</strong> — ยืนยัน Requirements ทุกข้อก่อน Re-generate Plan
              เพื่อให้ AI Builder รู้ขอบเขตที่แน่ชัด
            </span>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowPlanEdit(false)}
              className="btn-secondary text-sm"
            >
              ปิด
            </button>

            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || requirements.length === 0}
              className="flex items-center gap-2 btn-primary text-sm disabled:opacity-50"
            >
              {generateMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  กำลังสร้าง Plan...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  สร้าง Plan ใหม่
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
