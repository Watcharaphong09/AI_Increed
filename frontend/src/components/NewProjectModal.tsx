import { useState } from 'react'
import { X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { createProject } from '../api/projects'
import { useAppStore } from '../store/appStore'
import type { PlanningMode } from '../types'

interface Props {
  onClose: () => void
}

interface ModeOption {
  value: PlanningMode
  label: string
  description: string
  color: string
}

const modeOptions: ModeOption[] = [
  {
    value: 'AUTO',
    label: 'AUTO',
    description: 'ระบบเลือกโหมดให้อัตโนมัติตามความซับซ้อน',
    color: 'text-teal-400 border-teal-500/40 bg-teal-500/10',
  },
  {
    value: 'QUICK',
    label: 'QUICK',
    description: 'วางแผนเร็ว เหมาะกับโปรเจกต์เล็กหรือ MVP',
    color: 'text-green-400 border-green-500/40 bg-green-500/10',
  },
  {
    value: 'STANDARD',
    label: 'STANDARD',
    description: 'สมดุลระหว่างความเร็วและความละเอียด',
    color: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
  },
  {
    value: 'DETAILED',
    label: 'DETAILED',
    description: 'วางแผนละเอียด เหมาะกับโปรเจกต์ขนาดกลาง',
    color: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
  },
  {
    value: 'DEEP',
    label: 'DEEP',
    description: 'วิเคราะห์เชิงลึก ครอบคลุมทุก edge cases',
    color: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  },
  {
    value: 'ARCHITECT',
    label: 'ARCHITECT',
    description: 'ระดับ Architect เหมาะกับระบบขนาดใหญ่ที่ซับซ้อน',
    color: 'text-red-400 border-red-500/40 bg-red-500/10',
  },
]

export default function NewProjectModal({ onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<PlanningMode>('AUTO')
  const { addProject, setCurrentProject, showToast } = useAppStore()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      addProject(project)
      setCurrentProject(project)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      showToast(`สร้างโปรเจกต์ "${project.name}" เรียบร้อยแล้ว`, 'success')
      onClose()
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim(), description: description.trim(), planning_mode: mode })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-xl shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-gray-100">สร้างโปรเจกต์ใหม่</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">
              ชื่อโปรเจกต์ <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field w-full text-sm"
              placeholder="เช่น ระบบจัดการคลังสินค้า"
              maxLength={100}
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">
              คำอธิบาย <span className="text-gray-500">(ไม่บังคับ)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field w-full text-sm resize-none"
              placeholder="อธิบายภาพรวมของโปรเจกต์..."
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Planning mode */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">โหมดการวางแผน</label>
            <div className="grid grid-cols-2 gap-2">
              {modeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={clsx(
                    'text-left px-3 py-2.5 rounded-lg border text-xs transition-all duration-150',
                    mode === opt.value
                      ? opt.color + ' border-opacity-100'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300 bg-gray-800/40'
                  )}
                >
                  <div className="font-semibold mb-0.5">{opt.label}</div>
                  <div className={clsx('leading-tight', mode === opt.value ? 'opacity-80' : 'text-gray-500')}>
                    {opt.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              ยกเลิก
            </button>
            <button
              type="submit"
              className="btn-primary text-sm"
              disabled={!name.trim() || mutation.isPending}
            >
              {mutation.isPending ? 'กำลังสร้าง...' : 'สร้างโปรเจกต์'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
