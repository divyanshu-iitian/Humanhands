import { z } from 'zod';

export const ActionTypeSchema = z.enum([
  'click',
  'type',
  'select',
  'navigate',
  'waitFor',
  'extractText',
  'scroll',
  'hover',
  'focus',
  'clear',
  'submit',
  'check',
  'uncheck',
  'upload',
  'screenshot',
]);

export const ActionOptionsSchema = z.object({
  timeout: z.number().int().positive().default(10000),
  retries: z.number().int().nonnegative().max(5).default(3),
  retryDelay: z.number().int().nonnegative().default(500),
  waitForNavigation: z.boolean().default(false),
  waitForSelector: z.boolean().default(true),
  clearBeforeType: z.boolean().default(false),
  pressEnterAfterType: z.boolean().default(false),
  exact: z.boolean().default(false),
  force: z.boolean().default(false),
  scrollIntoView: z.boolean().default(true),
});

export const ActionTargetSchema = z.union([
  z.object({
    kind: z.literal('selector'),
    selector: z.string(),
    fallbackSelectors: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('element-id'),
    elementId: z.string(),
  }),
  z.object({
    kind: z.literal('text'),
    text: z.string(),
    role: z.string().optional(),
  }),
]);

export const ActionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: ActionTypeSchema,
  target: ActionTargetSchema.optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  options: ActionOptionsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
});

export const ActionErrorCodeSchema = z.enum([
  'ELEMENT_NOT_FOUND',
  'ELEMENT_NOT_INTERACTABLE',
  'ELEMENT_NOT_VISIBLE',
  'TIMEOUT',
  'NAVIGATION_FAILED',
  'SELECTOR_INVALID',
  'ACTION_NOT_SUPPORTED',
  'VALIDATION_FAILED',
  'UNKNOWN',
]);

export const ActionErrorSchema = z.object({
  code: ActionErrorCodeSchema,
  message: z.string(),
  selector: z.string().optional(),
  elementId: z.string().optional(),
  stack: z.string().optional(),
  retryable: z.boolean(),
});

export const ActionResultSchema = z.object({
  actionId: z.string(),
  sessionId: z.string(),
  type: ActionTypeSchema,
  success: z.boolean(),
  timestamp: z.number(),
  duration: z.number(),
  data: z.unknown().optional(),
  extractedText: z.string().optional(),
  navigatedUrl: z.string().optional(),
  error: ActionErrorSchema.optional(),
  retryCount: z.number().int().nonnegative().default(0),
  selectorUsed: z.string().optional(),
});

export type ActionType = z.infer<typeof ActionTypeSchema>;
export type ActionOptions = z.infer<typeof ActionOptionsSchema>;
export type ActionTarget = z.infer<typeof ActionTargetSchema>;
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type ActionErrorCode = z.infer<typeof ActionErrorCodeSchema>;
export type ActionError = z.infer<typeof ActionErrorSchema>;
export type ActionResult = z.infer<typeof ActionResultSchema>;
