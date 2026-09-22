import { create } from 'zustand'
import type { Project, Message, Requirement, Task } from '../types'
import { normalizeMessageMeta, type MessageMeta } from '../utils/normalizeMeta'

export type { MessageMeta }

// SessionStorage key for messageMeta persistence
const MESSAGE_META_KEY = 'ai_increed_message_meta'

function loadMessageMeta(): Record<string, MessageMeta> {
  try {
    const raw = sessionStorage.getItem(MESSAGE_META_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const normalized: Record<string, MessageMeta> = {}
    for (const [key, val] of Object.entries(parsed)) {
      normalized[key] = normalizeMessageMeta(val)
    }
    return normalized
  } catch {
    return {}
  }
}

function saveMessageMeta(meta: Record<string, MessageMeta>) {
  try {
    sessionStorage.setItem(MESSAGE_META_KEY, JSON.stringify(meta))
  } catch {
    // Ignore storage quota errors
  }
}

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

  // Message metadata (questions/suggestions/conflicts per planner message)
  messageMeta: Record<string, MessageMeta>
  mergeMessageMeta: (messageId: string, meta: MessageMeta) => void
  clearMessageMeta: () => void

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

  // Builder & Handoff
  builderCapabilities: import('../types').BuilderCapability | null
  setBuilderCapabilities: (cap: import('../types').BuilderCapability | null) => void
  selectedTaskForHandoff: Task | null
  setSelectedTaskForHandoff: (task: Task | null) => void
  selectedTaskForResult: Task | null
  setSelectedTaskForResult: (task: Task | null) => void
  activeMainTab: 'chat' | 'tasks'
  setActiveMainTab: (tab: 'chat' | 'tasks') => void

  // Plan Edit modal
  showPlanEdit: boolean
  setShowPlanEdit: (v: boolean) => void
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

  // Message metadata — persisted in sessionStorage
  messageMeta: loadMessageMeta(),
  mergeMessageMeta: (messageId, meta) =>
    set((state) => {
      const normalized = normalizeMessageMeta(meta)
      const updated = { ...state.messageMeta, [messageId]: normalized }
      saveMessageMeta(updated)
      return { messageMeta: updated }
    }),
  clearMessageMeta: () => {
    saveMessageMeta({})
    set({ messageMeta: {} })
  },

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

  // Builder & Handoff
  builderCapabilities: null,
  setBuilderCapabilities: (cap) => set({ builderCapabilities: cap }),
  selectedTaskForHandoff: null,
  setSelectedTaskForHandoff: (task) => set({ selectedTaskForHandoff: task }),
  selectedTaskForResult: null,
  setSelectedTaskForResult: (task) => set({ selectedTaskForResult: task }),
  activeMainTab: 'chat',
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),

  // Plan Edit
  showPlanEdit: false,
  setShowPlanEdit: (v) => set({ showPlanEdit: v }),
}))
