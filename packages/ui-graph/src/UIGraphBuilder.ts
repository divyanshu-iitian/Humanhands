import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import type {
  UIElement,
  UIGraph as UIGraphData,
  PageMetadata,
} from '@humanhands/shared-types';
import { UI_GRAPH_SCHEMA_VERSION } from '@humanhands/shared-types';
import { UIGraph } from './UIGraph.js';
import { isInteractable } from './normalizer.js';

export interface RawPageSnapshot {
  sessionId: string;
  url: string;
  title: string;
  elements: UIElement[];
  viewport: { width: number; height: number };
  scrollX?: number;
  scrollY?: number;
  isLoading?: boolean;
  previousChecksum?: string;
}

export class UIGraphBuilder {
  build(snapshot: RawPageSnapshot): UIGraph {
    const elementMap: Record<string, UIElement> = {};
    const rootIds: string[] = [];
    const interactableIds: string[] = [];
    const formIds: string[] = [];
    const modalIds: string[] = [];

    for (const el of snapshot.elements) {
      elementMap[el.id] = el;

      if (el.parentId === null) rootIds.push(el.id);
      if (isInteractable(el)) interactableIds.push(el.id);
      if (el.role === 'form') formIds.push(el.id);
      if (el.role === 'modal' || el.role === 'dialog') modalIds.push(el.id);
    }

    const metadata: PageMetadata = {
      url: snapshot.url,
      title: snapshot.title,
      viewport: {
        width: snapshot.viewport.width,
        height: snapshot.viewport.height,
        scrollX: snapshot.scrollX,
        scrollY: snapshot.scrollY,
      },
      isLoading: snapshot.isLoading ?? false,
      hasModal: modalIds.length > 0,
      totalElementCount: snapshot.elements.length,
      interactableCount: interactableIds.length,
    };

    const checksum = this.computeChecksum(snapshot.elements);
    const pageId = this.generatePageId(snapshot.url);

    const graphData: UIGraphData = {
      pageId,
      sessionId: snapshot.sessionId,
      url: snapshot.url,
      title: snapshot.title,
      timestamp: Date.now(),
      version: UI_GRAPH_SCHEMA_VERSION,
      elements: snapshot.elements,
      elementMap,
      rootIds,
      interactableIds,
      formIds,
      modalIds,
      metadata,
      checksum,
      previousChecksum: snapshot.previousChecksum,
    };

    return new UIGraph(graphData);
  }

  private computeChecksum(elements: UIElement[]): string {
    const fingerprint = elements
      .map((el) => `${el.id}:${el.text}:${el.enabled}:${el.visible}`)
      .sort()
      .join('|');
    return createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);
  }

  private generatePageId(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\//g, '_').replace(/^_/, '');
      const suffix = path || 'root';
      return `page_${suffix}_${Date.now().toString(36)}`;
    } catch {
      return `page_unknown_${randomUUID().slice(0, 8)}`;
    }
  }
}
