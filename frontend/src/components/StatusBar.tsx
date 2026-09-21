import clsx from 'clsx'
import { useAppStore } from '../store/appStore'
import type { PlanningMode, ProjectStatus } from '../types'

function modeColor(mode: PlanningMode): string {
  switch (mode) {
    case 'QUICK':
      return 'text-green-400 bg-green-500/10 border-green-500/30'
    case 'STANDARD':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    case 'DETAILED':
      return 'text-purple-400 bg-purple-500/10 border-purple-500/30'
    case 'DEEP':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/30'
    case 'ARCHITECT':
      return 'text-red-400 bg-red-500/10 border-red-500/30'
    case 'AUTO':
      return 'text-teal-400 bg-teal-500/10 border-teal-500/30'
  }
}

function statusColor(status: ProjectStatus): string {
  switch (status) {
    case 'PLANNING':
      return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    case 'BUILDING':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    case 'DONE':
      return 'text-green-400 bg-green-500/10 border-green-500/30'
  }
}

function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'PLANNING':
      return 'PLANNING'
    case 'BUILDING':
      return 'BUILDING'
    case 'DONE':
      return 'DONE'
  }
}

export default function StatusBar() {
  const { currentProject } = useAppStore()

  if (!currentProject) return null

  return (
    <div className="h-9 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-3 shrink-0">
      {/* Mode badge */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">โหมด:</span>
        <span
          className={clsx(
            'text-xs font-semibold px-2 py-0.5 rounded border',
            modeColor(currentProject.planning_mode)
          )}
        >
          {currentProject.planning_mode}
        </span>
      </div>

      <span className="text-gray-700">|</span>

      {/* Complexity */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Complexity:</span>
        <span className="text-xs font-medium text-gray-300">
          {currentProject.complexity_score !== null
            ? `${currentProject.complexity_score}/100`
            : 'ยังไม่ได้วัด'}
        </span>
      </div>

      <span className="text-gray-700">|</span>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">สถานะ:</span>
        <span
          className={clsx(
            'text-xs font-semibold px-2 py-0.5 rounded border',
            statusColor(currentProject.status)
          )}
        >
          {statusLabel(currentProject.status)}
        </span>
      </div>

      {/* Project name on right */}
      <div className="ml-auto">
        <span className="text-xs text-gray-600 truncate max-w-[160px] block">
          {currentProject.name}
        </span>
      </div>
    </div>
  )
}
