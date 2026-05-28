import type { UIGraph, ActionRequest } from '@humanhands/shared-types';
import { RuntimeStateSync } from './state-sync.js';
import { SmartMutationObserver } from './mutation-observer.js';
import { IncrementalDomExtractor } from './dom-extractor.js';
import { AccessibilityParser } from './accessibility-parser.js';
import { ActionRuntime, type ActionExecutionResult } from './action-runtime.js';

export interface RuntimeManagerConfig {
  sessionId: string;
  debounceMs?: number;
  onGraphUpdate?: (graph: UIGraph) => void;
  onActionResult?: (result: ActionExecutionResult) => void;
  enableDebug?: boolean;
}

// Augment window for debug interface
declare global {
  interface Window {
    __HUMANHANDS_DEBUG__: HumanHandsDebugInterface;
  }
}

interface HumanHandsDebugInterface {
  version: string;
  getGraph: () => UIGraph | null;
  getState: () => ReturnType<RuntimeStateSync['state']['valueOf']>;
  inspectElement: (hhId: string) => import('@humanhands/shared-types').UIElement | undefined;
  testSelector: (selector: string) => {
    count: number;
    unique: boolean;
    element: Element | null;
    selector: string;
  };
  listInteractable: () => import('@humanhands/shared-types').UIElement[];
  listForms: () => import('@humanhands/shared-types').UIElement[];
  getLandmarks: () => import('./accessibility-parser.js').LandmarkRegion[];
  getTabOrder: () => Element[];
  forceExtract: () => UIGraph;
  runAction: (type: string, selector: string, value?: string) => Promise<ActionExecutionResult>;
  getEventLog: () => Array<{ type: string; timestamp: number; payload: unknown }>;
  clearEventLog: () => void;
}

export class RuntimeManager {
  private readonly stateSync: RuntimeStateSync;
  private readonly observer: SmartMutationObserver;
  private readonly extractor: IncrementalDomExtractor;
  private readonly actionRuntime: ActionRuntime;
  private readonly accessibilityParser: AccessibilityParser;
  private readonly config: Required<Omit<RuntimeManagerConfig, 'onGraphUpdate' | 'onActionResult'>>;
  private readonly onGraphUpdate?: (graph: UIGraph) => void;
  private readonly onActionResult?: (result: ActionExecutionResult) => void;
  private pageId: string;
  private isInitialized = false;

  constructor(config: RuntimeManagerConfig) {
    this.config = {
      sessionId: config.sessionId,
      debounceMs: config.debounceMs ?? 350,
      enableDebug: config.enableDebug ?? true,
    };
    this.onGraphUpdate = config.onGraphUpdate;
    this.onActionResult = config.onActionResult;
    this.pageId = this.generatePageId();

    this.stateSync = new RuntimeStateSync(config.sessionId);
    this.extractor = new IncrementalDomExtractor(config.sessionId, this.pageId);
    this.actionRuntime = new ActionRuntime(this.extractor, this.stateSync);
    this.accessibilityParser = new AccessibilityParser();
    this.observer = new SmartMutationObserver(this.config.debounceMs);

    this.observer.onMutation((batch) => this.handleMutationBatch(batch));
  }

  async init(): Promise<UIGraph> {
    if (this.isInitialized) return this.stateSync.state.currentGraph!;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) =>
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
      );
    }

    this.stateSync.patch({ isLoading: document.readyState !== 'complete' });

    // Initial full extraction
    this.stateSync.markExtractionStarted();
    const result = this.extractor.fullExtract();
    const graph = this.buildGraph(result.elements);
    this.stateSync.setGraph(graph);
    this.onGraphUpdate?.(graph);

    // Start observing after initial extraction
    this.observer.start();
    this.stateSync.setReady();
    this.isInitialized = true;

    if (this.config.enableDebug) {
      this.installDebugInterface();
    }

    return graph;
  }

  destroy(): void {
    this.observer.stop();
    this.isInitialized = false;
    if (this.config.enableDebug) {
      try {
        // @ts-expect-error — intentional cleanup
        delete window.__HUMANHANDS_DEBUG__;
      } catch { /* ignore */ }
    }
  }

  async executeAction(request: ActionRequest): Promise<ActionExecutionResult> {
    const result = await this.actionRuntime.execute(request);

    // Re-extract after action to sync graph
    if (result.success) {
      this.scheduleExtraction('post-action');
    }

    this.onActionResult?.(result);
    return result;
  }

  get currentGraph(): UIGraph | null {
    return this.stateSync.state.currentGraph;
  }

  get sessionId(): string {
    return this.config.sessionId;
  }

  updateSession(sessionId: string): void {
    this.config.sessionId = sessionId;
    this.extractor.updateContext(sessionId, this.pageId);
  }

  private handleMutationBatch(batch: import('./mutation-observer.js').MutationBatch): void {
    this.stateSync.incrementMutations();

    if (batch.categories.has('route-change')) {
      this.pageId = this.generatePageId();
      this.extractor.updateContext(this.config.sessionId, this.pageId);
      this.stateSync.recordRouteChange(window.location.href, document.title);
      // Full re-extract on route change
      this.scheduleExtraction('route-change');
      return;
    }

    // Incremental update
    const removedHhIds = batch.removedNodes
      .map((n) => n.hhId)
      .filter((id): id is string => id !== null);

    const result = this.extractor.incrementalUpdate(
      batch.addedSubtrees,
      removedHhIds,
      batch.modifiedHhIds,
    );

    // Only rebuild graph if something actually changed
    if (result.added.length > 0 || result.removed.length > 0 || result.modified.length > 0) {
      const graph = this.buildGraph(result.elements);
      this.stateSync.setGraph(graph);
      this.onGraphUpdate?.(graph);
    }
  }

  private scheduleExtraction(reason: string): void {
    // Small delay to let the DOM settle after route change or action
    const delay = reason === 'route-change' ? 600 : 200;
    setTimeout(() => {
      this.stateSync.markExtractionStarted();
      const result = this.extractor.fullExtract();
      const graph = this.buildGraph(result.elements);
      this.stateSync.setGraph(graph);
      this.onGraphUpdate?.(graph);
    }, delay);
  }

  private buildGraph(elements: import('@humanhands/shared-types').UIElement[]): UIGraph {
    const elementMap: Record<string, import('@humanhands/shared-types').UIElement> = {};
    const rootIds: string[] = [];
    const interactableIds: string[] = [];
    const formIds: string[] = [];
    const modalIds: string[] = [];

    for (const el of elements) {
      elementMap[el.id] = el;
      if (el.parentId === null) rootIds.push(el.id);
      if (el.interactable) interactableIds.push(el.id);
      if (el.role === 'form') formIds.push(el.id);
      if (el.role === 'dialog' || el.role === 'modal') modalIds.push(el.id);
    }

    const checksum = this.computeChecksum(elements);

    return {
      pageId: this.pageId,
      sessionId: this.config.sessionId,
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      version: '1',
      elements,
      elementMap,
      rootIds,
      interactableIds,
      formIds,
      modalIds,
      metadata: {
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
        isLoading: document.readyState !== 'complete',
        hasModal: modalIds.length > 0,
        totalElementCount: elements.length,
        interactableCount: interactableIds.length,
      },
      checksum,
      previousChecksum: this.stateSync.state.currentGraph?.checksum,
    };
  }

  private computeChecksum(elements: import('@humanhands/shared-types').UIElement[]): string {
    const str = elements
      .map((el) => `${el.id}:${el.text}:${el.enabled}:${el.visible}`)
      .sort()
      .join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private generatePageId(): string {
    try {
      const path = new URL(window.location.href).pathname
        .replace(/\//g, '_')
        .replace(/^_/, '') || 'root';
      return `page_${path}_${Date.now().toString(36)}`;
    } catch {
      return `page_unknown_${Date.now().toString(36)}`;
    }
  }

  private installDebugInterface(): void {
    const self = this;

    window.__HUMANHANDS_DEBUG__ = {
      version: '0.1.0',

      getGraph: () => self.stateSync.state.currentGraph,

      getState: () => self.stateSync.state as ReturnType<RuntimeStateSync['state']['valueOf']>,

      inspectElement: (hhId: string) => self.extractor.getElementById(hhId),

      testSelector: (selector: string) => {
        try {
          const elements = document.querySelectorAll(selector);
          return {
            count: elements.length,
            unique: elements.length === 1,
            element: elements.length === 1 ? elements[0]! : null,
            selector,
          };
        } catch (err) {
          return { count: 0, unique: false, element: null, selector };
        }
      },

      listInteractable: () =>
        (self.stateSync.state.currentGraph?.interactableIds ?? [])
          .map((id) => self.extractor.getElementById(id))
          .filter((el): el is import('@humanhands/shared-types').UIElement => el !== undefined),

      listForms: () =>
        (self.stateSync.state.currentGraph?.formIds ?? [])
          .map((id) => self.extractor.getElementById(id))
          .filter((el): el is import('@humanhands/shared-types').UIElement => el !== undefined),

      getLandmarks: () => self.accessibilityParser.detectLandmarks(),

      getTabOrder: () => self.accessibilityParser.computeTabOrder(),

      forceExtract: () => {
        const result = self.extractor.fullExtract();
        const graph = self.buildGraph(result.elements);
        self.stateSync.setGraph(graph);
        self.onGraphUpdate?.(graph);
        return graph;
      },

      runAction: async (type: string, selector: string, value?: string) => {
        const request: ActionRequest = {
          id: crypto.randomUUID(),
          sessionId: self.config.sessionId,
          type: type as ActionRequest['type'],
          target: { kind: 'selector', selector },
          value,
          createdAt: Date.now(),
        };
        return self.executeAction(request);
      },

      getEventLog: () => self.stateSync.getEventLog(),

      clearEventLog: () => {
        // EventLog is internal — expose reset by creating fresh log via patch trick
        self.stateSync.logEvent('EVENT_LOG_CLEARED', {});
      },
    };

    console.info(
      '[HumanHands] Debug interface installed. Use window.__HUMANHANDS_DEBUG__ to inspect runtime state.',
    );
  }
}
