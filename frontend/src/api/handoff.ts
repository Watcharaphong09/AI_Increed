import apiClient from './client'
import type {
  BuilderCapability,
  ContextPreview,
  SendHandoffResponse,
  BuildResultSubmission,
} from '../types'

export async function getCapabilities(): Promise<BuilderCapability> {
  const { data } = await apiClient.get<BuilderCapability>('/handoff/capabilities')
  return data
}

export async function getContextPreview(
  projectId: string,
  taskId: string
): Promise<ContextPreview> {
  const { data } = await apiClient.get<ContextPreview>(
    `/handoff/${projectId}/${taskId}/preview`
  )
  return data
}

export async function sendToBuilder(
  projectId: string,
  taskId: string,
  mode: 'assisted' | 'manual' = 'assisted'
): Promise<SendHandoffResponse> {
  const { data } = await apiClient.post<SendHandoffResponse>(
    `/handoff/${projectId}/${taskId}/send`,
    { mode }
  )
  return data
}

export async function openWorkspace(
  projectId: string,
  taskId: string
): Promise<{ success: boolean; workspace: string }> {
  const { data } = await apiClient.post<{ success: boolean; workspace: string }>(
    `/handoff/${projectId}/${taskId}/open-workspace`
  )
  return data
}

export async function openFolder(
  projectId: string,
  taskId: string
): Promise<{ success: boolean; workspace: string }> {
  const { data } = await apiClient.post<{ success: boolean; workspace: string }>(
    `/handoff/${projectId}/${taskId}/open-folder`
  )
  return data
}

export async function submitBuildResult(
  projectId: string,
  taskId: string,
  result: BuildResultSubmission
): Promise<{ success: boolean; task_id: string; status: string; result_summary: string }> {
  const { data } = await apiClient.post<{
    success: boolean
    task_id: string
    status: string
    result_summary: string
  }>(`/handoff/${projectId}/${taskId}/result`, result)
  return data
}

export async function unlockTask(
  projectId: string,
  taskId: string
): Promise<{ success: boolean; task_id: string; status: string }> {
  const { data } = await apiClient.post<{
    success: boolean
    task_id: string
    status: string
  }>(`/handoff/${projectId}/${taskId}/unlock`)
  return data
}
