import { apiClient as api } from './api';
import type { AgentTask } from '@/types/agent.types';

export interface PlanTaskParams {
  goal: string;
  context?: {
    spec?: string | object;
    baseUrl?: string;
    activeEnvironment?: string;
  };
}

export async function createAgentPlan(params: PlanTaskParams): Promise<AgentTask> {
  const response = await api.post<{ success: boolean; task: AgentTask }>('/agent/plan', params);
  return response.data.task;
}

export async function executeAgentTask(params: { taskId?: string; goal?: string; context?: any }): Promise<AgentTask> {
  const response = await api.post<{ success: boolean; task: AgentTask }>('/agent/execute', params);
  return response.data.task;
}

export async function listAgentTasks(): Promise<AgentTask[]> {
  const response = await api.get<{ success: boolean; tasks: AgentTask[] }>('/agent/tasks');
  return response.data.tasks || [];
}

export async function getAgentTask(taskId: string): Promise<AgentTask> {
  const response = await api.get<{ success: boolean; task: AgentTask }>(`/agent/tasks/${taskId}`);
  return response.data.task;
}

export async function approveAgentStep(taskId: string, stepId: string): Promise<AgentTask> {
  const response = await api.post<{ success: boolean; task: AgentTask }>(`/agent/tasks/${taskId}/approve`, { stepId });
  return response.data.task;
}

export async function rejectAgentStep(taskId: string, stepId: string, reason?: string): Promise<AgentTask> {
  const response = await api.post<{ success: boolean; task: AgentTask }>(`/agent/tasks/${taskId}/reject`, { stepId, reason });
  return response.data.task;
}

export async function cancelAgentTask(taskId: string): Promise<AgentTask> {
  const response = await api.post<{ success: boolean; task: AgentTask }>(`/agent/tasks/${taskId}/cancel`);
  return response.data.task;
}

export async function listAgentTools(): Promise<Array<{ name: string; risk: string; requiresApproval: boolean; description: string }>> {
  const response = await api.get<{ success: boolean; tools: any[] }>('/agent/tools');
  return response.data.tools || [];
}
