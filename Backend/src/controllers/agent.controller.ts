import type { Request, Response, NextFunction } from 'express';
import { AgentOrchestratorService } from '../services/agentOrchestrator.service.js';
import { AGENT_TOOL_POLICIES } from '../types/agentTool.types.js';

const orchestrator = new AgentOrchestratorService();

export class AgentController {
  static async listTools(req: Request, res: Response) {
    const tools = Object.entries(AGENT_TOOL_POLICIES).map(([tool, policy]) => ({
      name: tool,
      risk: policy.risk,
      requiresApproval: policy.requiresApproval,
      description: policy.description,
    }));
    return res.json({ success: true, count: tools.length, tools });
  }

  static async createPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { goal, context } = req.body;
      if (!goal || typeof goal !== 'string') {
        return res.status(400).json({ error: 'A natural language goal string is required.' });
      }

      const task = await orchestrator.createPlan({ goal, context });
      return res.status(201).json({ success: true, task });
    } catch (err) {
      next(err);
    }
  }

  static async executeTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId, goal, context } = req.body;

      let targetTaskId = taskId;
      if (!targetTaskId && goal) {
        // Direct plan & execute
        const created = await orchestrator.createPlan({ goal, context });
        targetTaskId = created.taskId;
      }

      if (!targetTaskId) {
        return res.status(400).json({ error: 'Either taskId or goal is required to execute an agent task.' });
      }

      const task = await orchestrator.executeTask(targetTaskId);
      return res.json({ success: true, task });
    } catch (err) {
      next(err);
    }
  }

  static listTasks(req: Request, res: Response) {
    const tasks = orchestrator.listTasks();
    return res.json({ success: true, count: tasks.length, tasks });
  }

  static getTask(req: Request, res: Response) {
    const { taskId } = req.params;
    const task = orchestrator.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found.` });
    }
    return res.json({ success: true, task });
  }

  static async approveStep(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const { stepId } = req.body;
      if (!stepId) {
        return res.status(400).json({ error: 'stepId is required to approve an agent step.' });
      }

      const task = await orchestrator.approveStep(taskId, stepId);
      return res.json({ success: true, message: `Step ${stepId} approved.`, task });
    } catch (err) {
      next(err);
    }
  }

  static async rejectStep(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const { stepId, reason } = req.body;
      if (!stepId) {
        return res.status(400).json({ error: 'stepId is required to reject an agent step.' });
      }

      const task = await orchestrator.rejectStep(taskId, stepId, reason);
      return res.json({ success: true, message: `Step ${stepId} rejected.`, task });
    } catch (err) {
      next(err);
    }
  }

  static async cancelTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const task = await orchestrator.cancelTask(taskId);
      return res.json({ success: true, message: `Task ${taskId} cancelled.`, task });
    } catch (err) {
      next(err);
    }
  }

  static streamTaskEvents(req: Request, res: Response) {
    const { taskId } = req.params;
    const task = orchestrator.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found.` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial snapshot
    res.write(`data: ${JSON.stringify({ eventName: 'initial_state', task })}\n\n`);

    const listener = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    orchestrator.on(`task:${taskId}`, listener);

    req.on('close', () => {
      orchestrator.off(`task:${taskId}`, listener);
    });
  }
}
