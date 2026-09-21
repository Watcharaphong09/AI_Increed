import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, Circle } from 'lucide-react'
import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { getRequirements } from '../api/planner'
import type { Requirement } from '../types'

interface RequirementCategory {
  key: string
  label: string
  isCritical: boolean
}

const CATEGORIES: RequirementCategory[] = [
  { key: 'goal', label: 'เป้าหมาย (Goal)', isCritical: true },
  { key: 'users', label: 'ผู้ใช้งาน (Users)', isCritical: true },
  { key: 'features', label: 'ฟีเจอร์หลัก (Features)', isCritical: true },
  { key: 'user_flow', label: 'User Flow', isCritical: true },
  { key: 'ui_ux', label: 'UI/UX', isCritical: false },
  { key: 'technical', label: 'Technical Stack', isCritical: true },
  { key: 'edge_cases', label: 'Edge Cases', isCritical: false },
  { key: 'acceptance', label: 'Acceptance Criteria', isCritical: false },
]

function isConfirmed(reqs: Requirement[], category: string): boolean {
  const matching = reqs.filter(
    (r) => r.category.toLowerCase() === category.toLowerCase()
  )
  if (matching.length === 0) return false
  return matching.some((r) => r.status === 'CONFIRMED' || r.status === 'DEFAULTED')
}

function getCount(reqs: Requirement[], category: string): { confirmed: number; total: number } {
  const matching = reqs.filter(
    (r) => r.category.toLowerCase() === category.toLowerCase()
  )
  const confirmed = matching.filter(
    (r) => r.status === 'CONFIRMED' || r.status === 'DEFAULTED'
  ).length
  return { confirmed, total: matching.length }
}

export default function RequirementPanel() {
  const { currentProject, requirements, setRequirements, isReadyToBuild } = useAppStore()
  const [expanded, setExpanded] = useState(true)

  const { data: fetchedRequirements } = useQuery({
    queryKey: ['requirements', currentProject?.id],
    queryFn: () => getRequirements(currentProject!.id),
    enabled: !!currentProject,
  })

  useEffect(() => {
    if (fetchedRequirements) setRequirements(fetchedRequirements)
  }, [fetchedRequirements, setRequirements])

  if (!currentProject) return null

  const criticalCategories = CATEGORIES.filter((c) => c.isCritical)
  const allCriticalConfirmed = criticalCategories.every((c) =>
    isConfirmed(requirements, c.key)
  )

  return (
    <div className="border-t border-gray-800 bg-gray-900/60 shrink-0">
      {/* Panel header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            PROJECT STATE
          </span>
          {(isReadyToBuild || allCriticalConfirmed) && (
            <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded">
              READY TO BUILD
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-600" />
        )}
      </button>

      {/* Categories grid */}
      {expanded && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-4 gap-x-6 gap-y-1.5">
            {CATEGORIES.map((cat) => {
              const confirmed = isConfirmed(requirements, cat.key)
              const { confirmed: cnt, total } = getCount(requirements, cat.key)
              const hasItems = total > 0
              const partialLabel = hasItems && !confirmed ? `${cnt}/${total}` : null

              return (
                <div
                  key={cat.key}
                  className="flex items-center gap-1.5 min-w-0"
                >
                  {confirmed ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  ) : (
                    <Circle
                      className={clsx(
                        'w-3.5 h-3.5 shrink-0',
                        cat.isCritical ? 'text-gray-600' : 'text-gray-700'
                      )}
                    />
                  )}
                  <span
                    className={clsx(
                      'text-xs truncate',
                      confirmed ? 'text-gray-300' : 'text-gray-600'
                    )}
                  >
                    {cat.label}
                  </span>
                  {partialLabel && (
                    <span className="text-xs text-yellow-500 shrink-0">{partialLabel}</span>
                  )}
                </div>
              )
            })}
          </div>

          {requirements.length === 0 && (
            <p className="text-xs text-gray-700 text-center py-2">
              ยังไม่มีข้อมูล Requirements — เริ่มพูดคุยกับ Planner AI
            </p>
          )}
        </div>
      )}
    </div>
  )
}
