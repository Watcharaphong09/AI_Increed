import { useState } from 'react'
import { Plus, FolderOpen, Trash2, Circle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useAppStore } from '../store/appStore'
import { listProjects, deleteProject } from '../api/projects'
import NewProjectModal from './NewProjectModal'
import type { Project, ProjectStatus } from '../types'

function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'PLANNING':
      return 'วางแผน'
    case 'BUILDING':
      return 'กำลังสร้าง'
    case 'DONE':
      return 'เสร็จแล้ว'
  }
}

function statusColor(status: ProjectStatus): string {
  switch (status) {
    case 'PLANNING':
      return 'text-yellow-400'
    case 'BUILDING':
      return 'text-blue-400'
    case 'DONE':
      return 'text-green-400'
  }
}

export default function Sidebar() {
  const { currentProject, setCurrentProject, setRequirements, setTasks, showToast } =
    useAppStore()
  const [showModal, setShowModal] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      if (currentProject?.id === id) {
        setCurrentProject(null)
        setRequirements([])
        setTasks([])
      }
      showToast('ลบโปรเจกต์เรียบร้อยแล้ว', 'success')
      setConfirmDeleteId(null)
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
    },
  })

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project)
  }

  return (
    <>
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-3 py-3 border-b border-gray-800">
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg border border-blue-500/30 hover:border-blue-400/50 transition-all duration-150"
          >
            <Plus className="w-4 h-4" />
            โปรเจกต์ใหม่
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading ? (
            <div className="px-3 py-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-800/60 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <FolderOpen className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-600">ยังไม่มีโปรเจกต์</p>
            </div>
          ) : (
            <ul className="px-2 space-y-0.5">
              {projects.map((project) => {
                const isActive = currentProject?.id === project.id
                return (
                  <li key={project.id} className="group relative">
                    <button
                      onClick={() => handleSelectProject(project)}
                      className={clsx(
                        'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 flex flex-col gap-0.5',
                        isActive
                          ? 'bg-blue-600/20 border border-blue-500/40 text-gray-100'
                          : 'hover:bg-gray-800 text-gray-300 hover:text-gray-100'
                      )}
                    >
                      <span className="text-sm font-medium leading-tight truncate pr-5">
                        {project.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Circle
                          className={clsx('w-2 h-2 fill-current', statusColor(project.status))}
                        />
                        <span className={clsx('text-xs', statusColor(project.status))}>
                          {statusLabel(project.status)}
                        </span>
                      </div>
                    </button>

                    {/* Delete button */}
                    {confirmDeleteId === project.id ? (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-md p-0.5">
                        <button
                          onClick={() => deleteMutation.mutate(project.id)}
                          className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300 font-medium"
                          disabled={deleteMutation.isPending}
                        >
                          ลบ
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-200"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(project.id)
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 rounded transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">
            {projects.length} โปรเจกต์
          </p>
        </div>
      </aside>

      {showModal && (
        <NewProjectModal onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
