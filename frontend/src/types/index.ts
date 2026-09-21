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

// Task lifecycle status (Section 11)
export type TaskStatus =
  | 'DRAFT'
  | 'READY'
  | 'APPROVED'
  | 'HANDOFF_PENDING'
  | 'HANDED_OFF'
  | 'BUILDING'
  | 'TESTING'
  | 'REVIEW'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_ATTENTION'
  | 'CHANGES_REQUIRED'
  // Legacy / alias states
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'DONE'

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
  project_id: string
  task_number: number
  title: string
  goal: string
  status: TaskStatus
  priority: string
  builder: string
  handoff_mode: string
  md_path: string | null
  result_summary?: string
}

export interface RoleOverride {
  provider?: AIProvider
  api_key?: string
  base_url?: string
  model?: string
}

export interface Settings {
  ai_provider?: string
  ai_base_url?: string
  ai_api_key_masked?: string
  ai_model?: string
  planner_provider?: string
  planner_base_url?: string
  planner_api_key_masked?: string
  planner_model?: string
  reviewer_provider?: string
  reviewer_base_url?: string
  reviewer_api_key_masked?: string
  reviewer_model?: string
  // Legacy aliases
  provider?: AIProvider
  api_key?: string
  base_url?: string
  model?: string
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

// ── Builder & Handoff Interfaces ─────────────────────────────────────────────

export interface BuilderCapability {
  installed: boolean
  cli: boolean
  workspace_open: boolean
  deep_link: boolean
  automation: boolean
  executable_path: string | null
  method: string
  default_mode: string
  details: Record<string, any>
}

export interface ContextPreview {
  task_id: string
  task_number: number
  task_title: string
  estimated_tokens: number
  file_count: number
  included_files: string[]
  excluded_files: string[]
  builder_instructions: string
  is_budget_exceeded: boolean
  budget_limit: number
}

export interface SendHandoffResponse {
  task_id: string
  task_number: number
  status: string
  workspace_path: string
  manifest_path: string
  instruction_path: string
  instruction_text: string
  workspace_opened: boolean
  mode_used: string
  message: string
}

export interface BuildResultSubmission {
  status: string
  changed_files: string[]
  tests_status: string
  notes: string
  raw_markdown: string
}
