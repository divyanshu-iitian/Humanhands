import { z } from 'zod';

export const BoundingRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

export const SelectorMetadataSchema = z.object({
  primary: z.string(),
  fallbacks: z.array(z.string()),
  xpath: z.string().optional(),
  semantic: z.string().optional(),
  dataTestId: z.string().optional(),
});

export const AccessibilityMetadataSchema = z.object({
  ariaRole: z.string().optional(),
  ariaLabel: z.string().optional(),
  ariaDescription: z.string().optional(),
  ariaExpanded: z.boolean().optional(),
  ariaSelected: z.boolean().optional(),
  ariaChecked: z.union([z.boolean(), z.literal('mixed')]).optional(),
  ariaDisabled: z.boolean().optional(),
  ariaRequired: z.boolean().optional(),
  ariaHidden: z.boolean().optional(),
  ariaLive: z.enum(['off', 'polite', 'assertive']).optional(),
  tabIndex: z.number().optional(),
  focusable: z.boolean(),
  keyboardAccessible: z.boolean(),
});

export const UIElementRoleSchema = z.enum([
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'link',
  'form',
  'table',
  'table-row',
  'table-cell',
  'table-header',
  'modal',
  'nav',
  'heading',
  'list',
  'list-item',
  'image',
  'checkbox',
  'radio',
  'tab',
  'tab-panel',
  'menu',
  'menu-item',
  'dialog',
  'alert',
  'tooltip',
  'generic',
]);

export const UIElementSchema = z.object({
  id: z.string(),
  role: UIElementRoleSchema,
  tagName: z.string(),
  text: z.string(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  href: z.string().optional(),
  inputType: z.string().optional(),
  selector: SelectorMetadataSchema,
  visible: z.boolean(),
  enabled: z.boolean(),
  interactable: z.boolean(),
  bounds: BoundingRectSchema,
  accessibility: AccessibilityMetadataSchema,
  attributes: z.record(z.string(), z.string()),
  parentId: z.string().nullable(),
  childIds: z.array(z.string()),
  depth: z.number().int().nonnegative(),
  pageId: z.string(),
  extractedAt: z.number(),
});

export type BoundingRect = z.infer<typeof BoundingRectSchema>;
export type SelectorMetadata = z.infer<typeof SelectorMetadataSchema>;
export type AccessibilityMetadata = z.infer<typeof AccessibilityMetadataSchema>;
export type UIElementRole = z.infer<typeof UIElementRoleSchema>;
export type UIElement = z.infer<typeof UIElementSchema>;
