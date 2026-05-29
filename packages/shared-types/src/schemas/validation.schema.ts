import { z } from 'zod';

export const ValidationSeveritySchema = z.enum(['error', 'warning', 'info']);

export const ValidationIssueSchema = z.object({
  code: z.string(),
  severity: ValidationSeveritySchema,
  message: z.string(),
  stepId: z.string().optional(),
  variableName: z.string().optional(),
  selector: z.string().optional(),
  path: z.string().optional(),
  suggestion: z.string().optional(),
});

export const ValidationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  check: z.enum([
    'schema-valid',
    'selectors-valid',
    'variables-declared',
    'step-references-valid',
    'no-circular-deps',
    'required-inputs-present',
    'version-format-valid',
    'timeout-in-range',
    'actions-supported',
    'verification-rules-valid',
  ]),
});

export const ValidationReportSchema = z.object({
  workflowId: z.string(),
  workflowVersion: z.string(),
  validatedAt: z.number(),
  isValid: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  checkedRules: z.array(z.string()),
  executionInputs: z.record(z.string(), z.unknown()).optional(),
});

export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ValidationRule = z.infer<typeof ValidationRuleSchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;
