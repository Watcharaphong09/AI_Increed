import apiClient from './client'
import type { Project, CreateProjectData, Requirement, Task } from '../types'

export interface ProjectDetail extends Project {
  requirements: Requirement[]
  tasks: Task[]
}

/**
 * List all projects
 */
export async function listProjects(): Promise<Project[]> {
  const response = await apiClient.get<Project[]>('/projects')
  return response.data
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectData): Promise<Project> {
  const response = await apiClient.post<Project>('/projects', data)
  return response.data
}

/**
 * Get project detail with requirements and tasks
 */
export async function getProject(id: string): Promise<ProjectDetail> {
  const response = await apiClient.get<ProjectDetail>(`/projects/${id}`)
  return response.data
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`)
}

/**
 * Approve project and start building
 */
export async function approveProject(id: string): Promise<void> {
  await apiClient.post(`/projects/${id}/approve`)
}
