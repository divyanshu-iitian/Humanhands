import { z } from 'zod';
import { ActionTypeSchema, ActionOptionsSchema } from './action.schema.js';
import { UIElementRoleSchema, SelectorMetadataSchema, AccessibilityMetadataSchema, BoundingRectSchema } from './ui-element.schema.js';

export const RecordedTargetSchema = z.object({
  elementId: z.string(),
  selector: SelectorMetadataSchema,
  text: z.string(),
  role: UIElementRoleSchema,
  tagName: z.string(),
  inputType: z.string().optional(),
  accessibility: AccessibilityMetadataSchema,
  currentValue: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  bounds: BoundingRectSchema,
  formId: z.string().optional(),
  modalId: z.string().optional(),
});

export const PageContextSchema = z.object({
  url: z.string(),
  title: z.string(),
  graphChecksum: z.string(),
  routePattern: z.string().optional(),
  isModal: z.boolean(),
  loadState: z.enum(['loading', 'interactive', 'complete']),
  timestamp: z.number(),
});

export const ActionSnapshotSchema = z.object({
  url: z.string(),
  focusedElementId: z.string().optional(),
  targetValue: z.string().optional(),
  targetChecked: z.boolean().optional(),
  modalCount: z.number(),
  timestamp: z.number(),
});

export const RecordedActionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  recordingId: z.string(),
  sequenceNumber: z.number().int().nonnegative(),
  timestamp: z.number(),
  actionType: ActionTypeSchema,
  target: RecordedTargetSchema.optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  pageContext: PageContextSchema,
  options: ActionOptionsSchema.optional(),
  preState: ActionSnapshotSchema.optional(),
  postState: z.object({
    url: z.string(),
    targetValue: z.string().optional(),
    targetChecked: z.boolean().optional(),
    urlChanged: z.boolean(),
    newUrl: z.string().optional(),
    modalOpened: z.boolean(),
    modalClosed: z.boolean(),
    loadingStarted: z.boolean(),
    modalCount: z.number(),
  }).optional(),
  executionMeta: z.object({
    duration: z.number().optional(),
    retryCount: z.number().default(0),
    succeeded: z.boolean(),
    waitedForSelector: z.string().optional(),
    isNavigation: z.boolean().default(false),
    triggeredBy: z.enum(['user', 'automation', 'unknown']).default('unknown'),
  }),
});

export const WorkflowRecordingStatusSchema = z.enum([
  'recording',
  'paused',
  'completed',
  'cancelled',
]);

export const WorkflowRecordingSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  sessionId: z.string(),
  status: WorkflowRecordingStatusSchema,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  actions: z.array(RecordedActionSchema),
  pageHistory: z.array(z.string()),
  startUrl: z.string(),
  endUrl: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export type RecordedTarget = z.infer<typeof RecordedTargetSchema>;
export type PageContext = z.infer<typeof PageContextSchema>;
export type ActionSnapshot = z.infer<typeof ActionSnapshotSchema>;
export type RecordedAction = z.infer<typeof RecordedActionSchema>;
export type WorkflowRecordingStatus = z.infer<typeof WorkflowRecordingStatusSchema>;
export type WorkflowRecording = z.infer<typeof WorkflowRecordingSchema>;
