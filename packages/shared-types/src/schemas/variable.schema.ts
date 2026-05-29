import { z } from 'zod';

export const VariableTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'email',
  'phone',
  'date',
  'datetime',
  'currency',
  'url',
  'enum',
  'invoice-number',
  'order-number',
  'postal-code',
  'username',
  'id',
  'unknown',
]);

export const VariableValidationSchema = z.object({
  pattern: z.string().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  enum: z.array(z.string()).optional(),
  required: z.boolean().default(true),
  format: z.string().optional(),
});

export const DetectedVariableSchema = z.object({
  name: z.string(),
  type: VariableTypeSchema,
  placeholder: z.string(),
  sampleValue: z.string(),
  confidence: z.number().min(0).max(1),
  sourceField: z.string().optional(),
  sourceLabel: z.string().optional(),
  occurrences: z.number().int().nonnegative().default(1),
  validation: VariableValidationSchema.optional(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
  autoGenerate: z.string().optional(),
});

export const WorkflowVariableSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: VariableTypeSchema,
  required: z.boolean().default(true),
  description: z.string().optional(),
  placeholder: z.string(),
  sampleValue: z.string().optional(),
  validation: VariableValidationSchema.optional(),
  defaultValue: z.unknown().optional(),
  sourceField: z.string().optional(),
  autoGenerate: z.string().optional(),
});

export type VariableType = z.infer<typeof VariableTypeSchema>;
export type VariableValidation = z.infer<typeof VariableValidationSchema>;
export type DetectedVariable = z.infer<typeof DetectedVariableSchema>;
export type WorkflowVariable = z.infer<typeof WorkflowVariableSchema>;
