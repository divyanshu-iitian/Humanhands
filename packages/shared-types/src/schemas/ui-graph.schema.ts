import { z } from 'zod';
import { UIElementSchema } from './ui-element.schema.js';

export const ViewportSchema = z.object({
  width: z.number(),
  height: z.number(),
  devicePixelRatio: z.number().optional(),
  scrollX: z.number().optional(),
  scrollY: z.number().optional(),
});

export const PageMetadataSchema = z.object({
  url: z.string(),
  title: z.string(),
  favicon: z.string().optional(),
  language: z.string().optional(),
  viewport: ViewportSchema,
  isLoading: z.boolean(),
  hasModal: z.boolean(),
  totalElementCount: z.number(),
  interactableCount: z.number(),
});

export const UIGraphSchema = z.object({
  pageId: z.string(),
  sessionId: z.string(),
  url: z.string(),
  title: z.string(),
  timestamp: z.number(),
  version: z.string(),
  elements: z.array(UIElementSchema),
  elementMap: z.record(z.string(), UIElementSchema),
  rootIds: z.array(z.string()),
  interactableIds: z.array(z.string()),
  formIds: z.array(z.string()),
  modalIds: z.array(z.string()),
  metadata: PageMetadataSchema,
  checksum: z.string(),
  previousChecksum: z.string().optional(),
});

export type Viewport = z.infer<typeof ViewportSchema>;
export type PageMetadata = z.infer<typeof PageMetadataSchema>;
export type UIGraph = z.infer<typeof UIGraphSchema>;
