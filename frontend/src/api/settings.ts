import apiClient from './client'
import type { Settings } from '../types'

export interface TestConnectionResult {
  success: boolean
  provider?: string
  model?: string
  latency_ms?: number
  error?: string
  message?: string
}

/**
 * Get current settings (API keys will be masked after first save)
 */
export async function getSettings(): Promise<Settings> {
  const response = await apiClient.get<Settings>('/settings')
  return response.data
}

/**
 * Update settings
 */
export async function updateSettings(data: Partial<Settings>): Promise<Settings> {
  const response = await apiClient.put<Settings>('/settings', data)
  return response.data
}

/**
 * Test AI provider connection
 */
export async function testConnection(role: string = 'planner'): Promise<TestConnectionResult> {
  const response = await apiClient.post<TestConnectionResult>('/settings/test', { role })
  return response.data
}
