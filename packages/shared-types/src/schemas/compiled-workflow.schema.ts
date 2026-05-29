import { z } from 'zod';
import { ActionRequestSchema } from './action.schema.js';
import { WorkflowVariableSchema } from './variable.schema.js';

export const VerificationRuleTypeSchema = z.enum([
  'url-changed',
  'url-contains',
  'value-set',
  'element-visible',
  'element-hidden',
  'modal-appeared',
  'modal-dismissed',
  'text-contains',
  'loading-completed',
  'element-enabled',
  'element-disabled',
]);

export const VerificationRuleSchema = z.object({
  type: VerificationRuleTypeSchema,
  selector: z.string().optional(),
  expectedValue: z.string().optional(),
  urlPattern: z.string().optional(),
  textContent: z.string().optional(),
  timeout: z.number().int().positive().default(5000),
  required: z.boolean().default(true),
});

export const CompiledStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  action: ActionRequestSchema,
  retries: z.number().int().nonnegative().default(2),
  timeout: z.number().int().positive().default(10000),
  waitBefore: z.number().int().nonnegative().default(0),
  waitAfter: z.number().int().nonnegative().default(0),
  verificationRules: z.array(VerificationRuleSchema).default([]),
  onFailure: z.enum(['abort', 'retry', 'skip', 'fallback']).default('abort'),
  fallbackStepId: z.string().optional(),
  condition: z.string().optional(),
  tags: z.array(z.string()).default([]),
  sourceRecordingId: z.string().optional(),
  recordedAt: z.number().optional(),
});

export const WorkflowMetadataSchema = z.object({
  recordingId: z.string().optional(),
  compiledAt: z.string().datetime(),
  targetDomain: z.string().optional(),
  estimatedDurationMs: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
  author: z.string().optional(),
  usageCount: z.number().int().nonnegative().default(0),
  lastRunAt: z.string().datetime().optional(),
  successRate: z.number().min(0).max(1).optional(),
});

export const CompiledWorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver: X.Y.Z'),
  variables: z.array(WorkflowVariableSchema),
  steps: z.array(CompiledStepSchema),
  metadata: WorkflowMetadataSchema,
  previousVersionId: z.string().optional(),
  checksum: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type VerificationRuleType = z.infer<typeof VerificationRuleTypeSchema>;
export type VerificationRule = z.infer<typeof VerificationRuleSchema>;
export type CompiledStep = z.infer<typeof CompiledStepSchema>;
export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;
export type CompiledWorkflow = z.infer<typeof CompiledWorkflowSchema>;
