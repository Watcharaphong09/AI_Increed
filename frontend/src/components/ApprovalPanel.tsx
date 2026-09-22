import { useState } from 'react'
import { CheckCircle, Edit3, AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { approveProject } from '../api/projects'

export default function ApprovalPanel() {
  const { currentProject, isReadyToBuild, showToast, updateProject, setShowPlanEdit } = useAppStore()
  const [showConfirm, setShowConfirm] = useState(false)
  const queryClient = useQueryClient()

  const approveMutation = useMutation({
    mutationFn: () => approveProject(currentProject!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      const updated = { ...currentProject!, status: 'BUILDING' as const }
      updateProject(updated)
      showToast('อนุมัติโปรเจกต์แล้ว — เริ่ม Build!', 'success')
      setShowConfirm(false)
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
      setShowConfirm(false)
    },
  })

  if (!currentProject) return null

  const isAlreadyBuilding = currentProject.status === 'BUILDING' || currentProject.status === 'DONE'

  return (
    <>
      {/* Action bar */}
      <div className="h-12 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-4 shrink-0">
        {/* Edit Plan */}
        <button
          className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-gray-700"
          onClick={() => setShowPlanEdit(true)}
        >
          <Edit3 className="w-4 h-4" />
          แก้ไข Plan
        </button>

        {/* Approve & Build */}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!isReadyToBuild || isAlreadyBuilding}
          className="flex items-center gap-2 btn-primary text-sm"
        >
          <CheckCircle className="w-4 h-4" />
          {isAlreadyBuilding ? 'กำลัง Build...' : 'Approve & Build'}
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-gray-100 mb-1">
                  ยืนยันการ Approve
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  คุณกำลังจะอนุมัติ Plan และเริ่มกระบวนการ Build โปรเจกต์{' '}
                  <span className="text-gray-200 font-medium">"{currentProject.name}"</span>
                  <br />
                  การดำเนินการนี้ไม่สามารถย้อนกลับได้
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="btn-secondary text-sm"
                disabled={approveMutation.isPending}
              >
                ยกเลิก
              </button>
              <button
                onClick={() => approveMutation.mutate()}
                className="btn-primary text-sm"
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? 'กำลังดำเนินการ...' : '✓ ยืนยัน Approve & Build'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
