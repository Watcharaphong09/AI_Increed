import apiClient from './client'
import type { Message, PlannerResponse, Requirement, ComplexityEstimate } from '../types'

/**
 * Send a message to the planner and receive a structured response
 */
export async function sendMessage(
  projectId: string,
  message: string
): Promise<PlannerResponse> {
  const response = await apiClient.post<PlannerResponse>(
    `/projects/${projectId}/chat`,
    { message }
  )
  return response.data
}

/**
 * Get chat history for a project
 */
export async function getMessages(projectId: string): Promise<Message[]> {
  const response = await apiClient.get<Message[]>(`/projects/${projectId}/messages`)
  return response.data
}

/**
 * Estimate complexity and get recommended planning mode
 */
export async function estimateComplexity(
  projectId: string
): Promise<ComplexityEstimate> {
  const response = await apiClient.post<ComplexityEstimate>(
    `/projects/${projectId}/estimate-complexity`
  )
  return response.data
}

/**
 * Create a new requirement
 */
export async function createRequirement(
  projectId: string,
  data: { category?: string; content: string; status?: string; priority?: string; notes?: string }
): Promise<Requirement> {
  const response = await apiClient.post<Requirement>(
    `/projects/${projectId}/requirements`,
    data
  )
  return response.data
}

/**
 * Get all requirements for a project
 */
export async function getRequirements(projectId: string): Promise<Requirement[]> {
  const response = await apiClient.get<Requirement[]>(
    `/projects/${projectId}/requirements`
  )
  return response.data
}

/**
 * Update a requirement
 */
export async function updateRequirement(
  projectId: string,
  reqId: string,
  data: Partial<Pick<Requirement, 'content' | 'status'>>
): Promise<Requirement> {
  const response = await apiClient.patch<Requirement>(
    `/projects/${projectId}/requirements/${reqId}`,
    data
  )
  return response.data
}

/**
 * Generate execution plan from confirmed requirements
 */
export async function generatePlan(projectId: string): Promise<void> {
  await apiClient.post(`/projects/${projectId}/generate-plan`)
}
