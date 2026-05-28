import { z } from 'zod';

export const EventTypeSchema = z.enum([
  'DOM_UPDATED',
  'ACTION_STARTED',
  'ACTION_COMPLETED',
  'ACTION_FAILED',
  'PAGE_CHANGED',
  'PAGE_LOADED',
  'STATE_UPDATED',
  'GRAPH_EXTRACTED',
  'SESSION_STARTED',
  'SESSION_ENDED',
  'OBSERVER_READY',
  'OBSERVER_ERROR',
  'WEBSOCKET_CONNECTED',
  'WEBSOCKET_DISCONNECTED',
  'WORKFLOW_STARTED',
  'WORKFLOW_COMPLETED',
  'WORKFLOW_FAILED',
  'WORKFLOW_STEP_STARTED',
  'WORKFLOW_STEP_COMPLETED',
  'ERROR',
]);

export const WorkflowEventSchema = z.object({
  id: z.string(),
  type: EventTypeSchema,
  timestamp: z.number(),
  sessionId: z.string(),
  source: z.string(),
  payload: z.unknown(),
  correlationId: z.string().optional(),
  sequenceNumber: z.number().int().nonnegative(),
  tags: z.record(z.string(), z.string()).optional(),
});

export const EventFilterSchema = z.object({
  types: z.array(EventTypeSchema).optional(),
  sessionId: z.string().optional(),
  source: z.string().optional(),
  since: z.number().optional(),
});

export type EventType = z.infer<typeof EventTypeSchema>;
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;
export type EventFilter = z.infer<typeof EventFilterSchema>;
