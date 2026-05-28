import { z } from 'zod';
import { ActionRequestSchema, ActionResultSchema } from './action.schema.js';

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  action: ActionRequestSchema,
  preconditions: z.array(z.string()).default([]),
  postconditions: z.array(z.string()).default([]),
  onFailure: z.enum(['abort', 'retry', 'skip', 'fallback']).default('abort'),
  retryOverrides: z
    .object({
      maxRetries: z.number().int().nonnegative().optional(),
      retryDelay: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  steps: z.array(WorkflowStepSchema),
  variables: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WorkflowStepResultSchema = z.object({
  stepId: z.string(),
  stepName: z.string(),
  actionResult: ActionResultSchema,
  startedAt: z.number(),
  completedAt: z.number(),
  skipped: z.boolean().default(false),
});

export const WorkflowExecutionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  sessionId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'aborted']),
  currentStepIndex: z.number().int().nonnegative(),
  totalSteps: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  stepResults: z.array(WorkflowStepResultSchema),
  error: z.string().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowStepResult = z.infer<typeof WorkflowStepResultSchema>;
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
