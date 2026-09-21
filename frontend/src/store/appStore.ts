import { create } from 'zustand'
import type { Project, Message, Requirement, Task } from '../types'

interface AppStore {
  // Projects
  projects: Project[]
  currentProject: Project | null
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  addProject: (project: Project) => void
  removeProject: (id: string) => void
  updateProject: (project: Project) => void

  // Chat
  messages: Message[]
  addMessage: (msg: Message) => void
  setMessages: (msgs: Message[]) => void
  clearMessages: () => void

  // UI state
  isChatLoading: boolean
  setIsChatLoading: (v: boolean) => void

  // Requirements
  requirements: Requirement[]
  setRequirements: (reqs: Requirement[]) => void

  // Tasks
  tasks: Task[]
  setTasks: (tasks: Task[]) => void

  // Settings panel
  showSettings: boolean
  setShowSettings: (v: boolean) => void

  // Toast notifications
  toast: { message: string; type: 'success' | 'error' | 'info' } | null
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  clearToast: () => void

  // Ready to build state
  isReadyToBuild: boolean
  setIsReadyToBuild: (v: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  // Projects
  projects: [],
  currentProject: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) =>
    set({ currentProject: project, messages: [], requirements: [], tasks: [], isReadyToBuild: false }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    })),
  updateProject: (project) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === project.id ? project : p)),
      currentProject: state.currentProject?.id === project.id ? project : state.currentProject,
    })),

  // Chat
  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  clearMessages: () => set({ messages: [] }),

  // UI state
  isChatLoading: false,
  setIsChatLoading: (v) => set({ isChatLoading: v }),

  // Requirements
  requirements: [],
  setRequirements: (reqs) => set({ requirements: reqs }),

  // Tasks
  tasks: [],
  setTasks: (tasks) => set({ tasks }),

  // Settings panel
  showSettings: false,
  setShowSettings: (v) => set({ showSettings: v }),

  // Toast
  toast: null,
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 4000)
  },
  clearToast: () => set({ toast: null }),

  // Ready to build
  isReadyToBuild: false,
  setIsReadyToBuild: (v) => set({ isReadyToBuild: v }),
}))
