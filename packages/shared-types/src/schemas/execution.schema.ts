import { z } from 'zod';
import { ActionResultSchema } from './action.schema.js';

export const ExecutionModeSchema = z.enum(['dry-run', 'validation', 'production']);

export const StepStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'skipped',
  'retrying',
]);

export const StepVerificationSchema = z.object({
  strategy: z.string(),
  passed: z.boolean(),
  expected: z.string(),
  actual: z.string(),
  timestamp: z.number(),
});

export const StepExecutionResultSchema = z.object({
  stepId: z.string(),
  stepName: z.string(),
  status: StepStatusSchema,
  startedAt: z.number(),
  completedAt: z.number().optional(),
  duration: z.number().optional(),
  actionResult: ActionResultSchema.optional(),
  verification: StepVerificationSchema.optional(),
  error: z.string().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  selectorUsed: z.string().optional(),
  resolvedValue: z.string().optional(),
  skippedReason: z.string().optional(),
});

export const WorkflowExecutionSummarySchema = z.object({
  totalSteps: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  verificationsPassed: z.number().int().nonnegative(),
  verificationsFailed: z.number().int().nonnegative(),
});

export const WorkflowExecutionResultSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  workflowVersion: z.string(),
  sessionId: z.string(),
  mode: ExecutionModeSchema,
  status: z.enum(['pending', 'running', 'completed', 'failed', 'aborted']),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  totalDuration: z.number().optional(),
  resolvedVariables: z.record(z.string(), z.unknown()),
  stepResults: z.array(StepExecutionResultSchema),
  failedAtStep: z.string().optional(),
  error: z.string().optional(),
  summary: WorkflowExecutionSummarySchema,
});

export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;
export type StepVerification = z.infer<typeof StepVerificationSchema>;
export type StepExecutionResult = z.infer<typeof StepExecutionResultSchema>;
export type WorkflowExecutionSummary = z.infer<typeof WorkflowExecutionSummarySchema>;
export type WorkflowExecutionResult = z.infer<typeof WorkflowExecutionResultSchema>;
