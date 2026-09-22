import apiClient from './client'
import type { Task } from '../types'

/**
 * List all tasks for a project
 */
export async function listTasks(projectId: string): Promise<Task[]> {
  const response = await apiClient.get<Task[]>(`/tasks/${projectId}`)
  return response.data
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  projectId: string,
  taskId: string,
  status: string
): Promise<Task> {
  const response = await apiClient.put<Task>(`/tasks/${projectId}/${taskId}/status`, { status })
  return response.data
}

/**
 * Generate task .md files for a project
 */
export async function generateTaskFiles(projectId: string): Promise<{
  message: string
  workspace_path: string
  task_count: number
}> {
  const response = await apiClient.post(`/tasks/${projectId}/generate`)
  return response.data
}
