// Planning modes
export type PlanningMode = 'QUICK' | 'STANDARD' | 'DETAILED' | 'DEEP' | 'ARCHITECT' | 'AUTO'

// Project status
export type ProjectStatus = 'PLANNING' | 'BUILDING' | 'DONE'

// Requirement status
export type RequirementStatus =
  | 'UNKNOWN'
  | 'PROPOSED'
  | 'CONFIRMED'
  | 'DEFAULTED'
  | 'REJECTED'
  | 'BLOCKED'

// Question priority
export type QuestionPriority = 'BLOCKING' | 'IMPORTANT' | 'OPTIONAL'

// Task status
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED'

// AI Provider
export type AIProvider = 'openai' | 'groq' | 'azure' | 'ollama'

export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  planning_mode: PlanningMode
  complexity_score: number | null
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  role: 'user' | 'planner'
  content: string
  created_at: string
}

export interface Question {
  text: string
  priority: QuestionPriority
  category: string
}

export interface PlannerResponse {
  message: string
  questions: Question[]
  suggestions: string[]
  conflicts: string[]
  is_ready_to_build: boolean
}

export interface Requirement {
  id: string
  category: string
  content: string
  status: RequirementStatus
  priority: QuestionPriority
}

export interface Task {
  id: string
  task_number: number
  title: string
  goal: string
  status: TaskStatus
  md_path: string | null
}

export interface RoleOverride {
  provider?: AIProvider
  api_key?: string
  base_url?: string
  model?: string
}

export interface Settings {
  provider: AIProvider
  api_key: string // masked after save
  base_url: string
  model: string
  planner_override?: RoleOverride
  reviewer_override?: RoleOverride
}

export interface CreateProjectData {
  name: string
  description: string
  planning_mode: PlanningMode
}

export interface ComplexityEstimate {
  score: number
  recommended_mode: PlanningMode
}
