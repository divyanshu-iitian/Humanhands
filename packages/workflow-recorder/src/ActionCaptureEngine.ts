import { randomUUID } from 'crypto';
import type {
  RecordedAction,
  ActionType,
  UIElement,
  UIGraph,
  PageContext,
  ActionSnapshot,
} from '@humanhands/shared-types';

export interface CaptureInput {
  actionType: ActionType;
  element?: UIElement;
  value?: string;
  url?: string;
  currentGraph: UIGraph | null;
  preState?: ActionSnapshot;
  postState?: RecordedAction['postState'];
  duration?: number;
  retryCount?: number;
  succeeded?: boolean;
  triggeredBy?: 'user' | 'automation' | 'unknown';
}

/**
 * Enriches raw action inputs with full semantic context from the UI graph.
 *
 * This is where "not just WHAT happened but WHY it happened" is implemented:
 * - Resolves element context (form membership, modal context, role)
 * - Captures load state
 * - Tags navigation actions
 * - Records page transition intent
 */
export class ActionCaptureEngine {
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  capture(input: CaptureInput): Omit<RecordedAction, 'recordingId' | 'sequenceNumber'> {
    const graph = input.currentGraph;
    const element = input.element;
    const pageContext = this.buildPageContext(graph, input.url);

    return {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: Date.now(),
      actionType: input.actionType,
      target: element ? this.buildTarget(element, graph) : undefined,
      value: input.value,
      url: input.url,
      pageContext,
      preState: input.preState,
      postState: input.postState,
      executionMeta: {
        duration: input.duration,
        retryCount: input.retryCount ?? 0,
        succeeded: input.succeeded ?? true,
        isNavigation: input.actionType === 'navigate' || !!input.postState?.urlChanged,
        triggeredBy: input.triggeredBy ?? 'unknown',
      },
    };
  }

  buildPageContext(graph: UIGraph | null, fallbackUrl?: string): PageContext {
    return {
      url: graph?.url ?? fallbackUrl ?? '',
      title: graph?.title ?? '',
      graphChecksum: graph?.checksum ?? '',
      routePattern: this.extractRoutePattern(graph?.url ?? fallbackUrl),
      isModal: (graph?.modalIds?.length ?? 0) > 0,
      loadState: 'complete',
      timestamp: Date.now(),
    };
  }

  private buildTarget(
    element: UIElement,
    graph: UIGraph | null,
  ): RecordedAction['target'] {
    const formContext = graph ? this.findFormContext(element, graph) : undefined;
    const modalContext = graph ? this.findModalContext(element, graph) : undefined;

    return {
      elementId: element.id,
      selector: element.selector,
      text: element.text,
      role: element.role,
      tagName: element.tagName,
      accessibility: element.accessibility,
      currentValue: element.value,
      bounds: element.bounds,
      formId: formContext?.id,
      modalId: modalContext?.id,
    };
  }

  private findFormContext(element: UIElement, graph: UIGraph): UIElement | undefined {
    for (const formId of graph.formIds) {
      const form = graph.elementMap[formId];
      if (form && this.isDescendantOf(element, form, graph)) return form;
    }
    return undefined;
  }

  private findModalContext(element: UIElement, graph: UIGraph): UIElement | undefined {
    for (const modalId of graph.modalIds) {
      const modal = graph.elementMap[modalId];
      if (modal && this.isDescendantOf(element, modal, graph)) return modal;
    }
    return undefined;
  }

  private isDescendantOf(child: UIElement, ancestor: UIElement, graph: UIGraph): boolean {
    let current: UIElement | undefined = child;
    let depth = 0;
    while (current && depth < 20) {
      if (current.parentId === ancestor.id) return true;
      current = current.parentId ? graph.elementMap[current.parentId] : undefined;
      depth++;
    }
    return false;
  }

  private extractRoutePattern(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      // Replace UUIDs, numeric IDs, and hashes with patterns
      const pattern = parsed.pathname
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
        .replace(/\/\d{4,}/g, '/:id')
        .replace(/\/[a-z0-9]{20,}/gi, '/:hash');
      return `${parsed.origin}${pattern}`;
    } catch {
      return undefined;
    }
  }
}
