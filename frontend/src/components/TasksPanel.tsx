import { useEffect } from 'react'
import { CheckCircle2, Clock, AlertTriangle, Rocket, ChevronRight, FileText, Check, RefreshCw, FolderOpen } from 'lucide-react'
import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { listTasks } from '../api/tasks'
import { openProjectFolder } from '../api/projects'
import type { Task, TaskStatus } from '../types'

interface TasksPanelProps {
  onSelectTask: (task: Task) => void
  onOpenResultModal: (task: Task) => void
}

export default function TasksPanel({
  onSelectTask,
  onOpenResultModal,
}: TasksPanelProps) {
  const { currentProject, tasks, setTasks, showToast } = useAppStore()


  // Fetch tasks from API whenever project changes
  const { data: fetchedTasks, isLoading, refetch } = useQuery({
    queryKey: ['tasks', currentProject?.id],
    queryFn: () => listTasks(currentProject!.id),
    enabled: !!currentProject,
    staleTime: 10_000,
  })

  // Safe tasks array: prioritize fetched data, fallback to store, fallback to empty array
  const taskItems: Task[] = Array.isArray(fetchedTasks)
    ? fetchedTasks
    : Array.isArray(tasks)
    ? tasks
    : []

  // Sync to global store only when actual data is received from API
  useEffect(() => {
    if (fetchedTasks && Array.isArray(fetchedTasks)) {
      setTasks(fetchedTasks)
    }
  }, [fetchedTasks, setTasks])

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-500 text-sm">
        เลือกหรือสร้างโปรเจกต์เพื่อดู Tasks
      </div>
    )
  }

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'COMPLETED':
      case 'DONE':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="w-3.5 h-3.5" />
            COMPLETED
          </span>
        )
      case 'BUILDING':
      case 'HANDED_OFF':
      case 'HANDOFF_PENDING':
      case 'IN_PROGRESS':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/60 animate-pulse">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            BUILDING
          </span>
        )
      case 'FAILED':
      case 'CHANGES_REQUIRED':
      case 'NEEDS_ATTENTION':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-800/60">
            <AlertTriangle className="w-3.5 h-3.5" />
            {status}
          </span>
        )
      case 'READY':
      case 'APPROVED':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-950/80 text-blue-400 border border-blue-800/60">
            <Rocket className="w-3.5 h-3.5" />
            READY FOR BUILD
          </span>
        )
      default:
        return (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-100">
            Tasks & Antigravity Handoff
          </h2>
          <p className="text-xs text-gray-400">
            รายการงานที่แยกย่อยและพร้อมส่งให้ Antigravity ดำเนินการ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400 bg-gray-800/80 px-2.5 py-1 rounded-md border border-gray-700">
            {taskItems.filter((t) => t.status === 'COMPLETED' || t.status === 'DONE').length}/{taskItems.length} เสร็จแล้ว
          </span>
          {/* Open workspace folder button */}
          <button
            onClick={() => {
              if (currentProject) {
                openProjectFolder(currentProject.id)
                  .then(() => showToast('เปิดโฟลเดอร์ Workspace ใน Explorer แล้ว', 'success'))
                  .catch(() => showToast('เปิดโฟลเดอร์ไม่สำเร็จ', 'error'))
              }
            }}
            title="เปิดโฟลเดอร์ Workspace ใน Windows Explorer"
            className="flex items-center gap-1 text-xs px-2.5 py-1 text-gray-300 hover:text-gray-100 hover:bg-gray-800 rounded-md border border-gray-700 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>โฟลเดอร์ Workspace</span>
          </button>
          {/* Refresh button */}
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            title="รีเฟรช Tasks"
            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-800/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : taskItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <FileText className="w-10 h-10 text-gray-600" />
          <p className="text-sm text-gray-400 font-medium">
            ยังไม่มี Task ในโปรเจกต์นี้
          </p>
          <p className="text-xs text-gray-500 max-w-sm">
            คุยกับ Planner ในแท็บ Chat เพื่อวิเคราะห์ความต้องการ เมื่อครบถ้วนแล้วกด "แก้ไข Plan" แล้วกด "สร้าง Plan ใหม่"
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {taskItems.map((task) => {
            const isCompleted = task.status === 'COMPLETED' || task.status === 'DONE'
            const isBuilding =
              task.status === 'BUILDING' ||
              task.status === 'HANDED_OFF' ||
              task.status === 'IN_PROGRESS'
            const taskNumStr = (task.task_number ?? 0).toString().padStart(3, '0')

            return (
              <div
                key={task.id}
                className={clsx(
                  'p-4 rounded-xl border transition-all duration-200 bg-gray-900/90 flex flex-col gap-3 group',
                  isBuilding && 'border-amber-500/50 shadow-lg shadow-amber-950/20',
                  isCompleted && 'border-gray-800 bg-gray-900/40',
                  !isBuilding && !isCompleted && 'border-gray-800 hover:border-blue-500/50 hover:bg-gray-850'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/60">
                        TASK-{taskNumStr}
                      </span>
                      <h3 className="text-sm font-semibold text-gray-100 truncate">
                        {task.title}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">
                      {task.goal || '_No goal provided_'}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {getStatusBadge(task.status)}
                  </div>
                </div>

                {/* Metadata & Actions row */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-800/60 text-xs">
                  <div className="flex items-center gap-3 text-gray-500 text-[11px]">
                    <span>Priority: <strong className="text-gray-300">{task.priority || 'HIGH'}</strong></span>
                    <span>•</span>
                    <span>Builder: <strong className="text-gray-300">{task.builder || 'antigravity'}</strong></span>
                    {task.result_summary && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400 truncate max-w-xs">{task.result_summary}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isBuilding && (
                      <button
                        onClick={() => onOpenResultModal(task)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        บันทึกผลลัพธ์
                      </button>
                    )}
                    <button
                      onClick={() => onSelectTask(task)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors flex items-center gap-1.5"
                    >
                      <Rocket className="w-3.5 h-3.5 text-blue-400" />
                      {isCompleted ? 'ดูรายละเอียด' : isBuilding ? 'ดู Build' : '🚀 Handoff'}
                      <ChevronRight className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
