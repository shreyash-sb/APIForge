import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIAssistantPage } from '@/pages/AI/AIAssistantPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import * as agentService from '@/services/agentService';
import type { AgentTask } from '@/types/agent.types';

const mockPlannedTask: AgentTask = {
  taskId: 'task_test_123',
  goal: 'Run full regression test on active endpoints',
  advisoryPlan: '1. Inspect specification\n2. Execute live boundary requests',
  status: 'WAITING_FOR_APPROVAL',
  currentStepIndex: 1,
  steps: [
    {
      stepId: 'step_1',
      tool: 'inspect_api',
      arguments: { spec: {} },
      dependsOn: [],
      risk: 'READ_ONLY',
      requiresApproval: false,
      summary: 'Inspect OpenAPI specification contracts and endpoints',
      status: 'SUCCEEDED',
      output: { endpointsCount: 5 },
    },
    {
      stepId: 'step_2',
      tool: 'send_api_request',
      arguments: { url: 'https://api.example.com/users', method: 'GET' },
      dependsOn: ['step_1'],
      risk: 'NETWORK_EXECUTION',
      requiresApproval: true,
      summary: 'Execute live boundary requests against remote host',
      status: 'WAITING_FOR_APPROVAL',
    },
  ],
  artifacts: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock('@/services/agentService', () => ({
  createAgentPlan: vi.fn(),
  executeAgentTask: vi.fn(),
  approveAgentStep: vi.fn(),
  rejectAgentStep: vi.fn(),
  cancelAgentTask: vi.fn(),
  listAgentTasks: vi.fn().mockResolvedValue([]),
  getAgentTask: vi.fn(),
}));

describe('AgentWorkspace Component Integration Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders Agent Workspace controls, presets, and goal input', () => {
    renderWithRouter(<AIAssistantPage />);

    expect(screen.getByText('APIForge Agent Workspace')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Inspect API, generate test suite/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /formulate plan/i })).toBeInTheDocument();
  });

  it('populates goal when a quick preset button is clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<AIAssistantPage />);

    const presetBtn = screen.getByRole('button', { name: /run full regression test/i });
    await user.click(presetBtn);

    const input = screen.getByPlaceholderText(/Inspect API, generate test suite/i);
    expect(input).toHaveValue('Run full regression test on active endpoints');
  });

  it('executes agent task and allows step approval', async () => {
    vi.mocked(agentService.createAgentPlan).mockResolvedValue(mockPlannedTask);
    vi.mocked(agentService.approveAgentStep).mockResolvedValue({
      ...mockPlannedTask,
      status: 'COMPLETED',
      steps: mockPlannedTask.steps.map((s) => ({ ...s, status: 'SUCCEEDED' })),
    });

    const user = userEvent.setup();
    renderWithRouter(<AIAssistantPage />);

    const input = screen.getByPlaceholderText(/Inspect API, generate test suite/i);
    await user.type(input, 'Run full regression test on active endpoints');

    const planBtn = screen.getByRole('button', { name: /formulate plan/i });
    await user.click(planBtn);

    // Timeline renders step awaiting approval
    expect(await screen.findByText('WAITING FOR APPROVAL')).toBeInTheDocument();

    // Click Approve button
    const approveBtn = screen.getByRole('button', { name: /approve step execution/i });
    await user.click(approveBtn);

    expect(agentService.approveAgentStep).toHaveBeenCalledWith('task_test_123', 'step_2');
  });
});
