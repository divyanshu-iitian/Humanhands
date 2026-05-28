import type { UIGraph, ActionRequest } from '@humanhands/shared-types';

export interface RuntimeState {
  readonly sessionId: string;
  readonly pageId: string;
  readonly currentGraph: UIGraph | null;
  readonly previousGraph: UIGraph | null;
  readonly isLoading: boolean;
  readonly currentUrl: string;
  readonly currentTitle: string;
  readonly activeModalIds: string[];
  readonly focusedElementId: string | null;
  readonly pendingActionIds: string[];
  readonly lastExtractedAt: number;
  readonly mutationCount: number;
  readonly isReady: boolean;
  readonly extractionInProgress: boolean;
  readonly routeChangedAt: number;
}

export interface GraphDiff {
  added: import('@humanhands/shared-types').UIElement[];
  removed: import('@humanhands/shared-types').UIElement[];
  modified: import('@humanhands/shared-types').UIElement[];
  unchanged: number;
  checksumChanged: boolean;
}

type StateListener = (state: Readonly<RuntimeState>, prev: Readonly<RuntimeState>) => void;

export class RuntimeStateSync {
  private _state: RuntimeState;
  private readonly listeners = new Set<StateListener>();
  private readonly pendingActions = new Map<string, ActionRequest>();
  private readonly eventLog: Array<{ type: string; timestamp: number; payload: unknown }> = [];
  private readonly maxEventLogSize = 200;

  constructor(sessionId: string) {
    this._state = {
      sessionId,
      pageId: '',
      currentGraph: null,
      previousGraph: null,
      isLoading: document.readyState !== 'complete',
      currentUrl: window.location.href,
      currentTitle: document.title,
      activeModalIds: [],
      focusedElementId: null,
      pendingActionIds: [],
      lastExtractedAt: 0,
      mutationCount: 0,
      isReady: false,
      extractionInProgress: false,
      routeChangedAt: 0,
    };
  }

  get state(): Readonly<RuntimeState> {
    return this._state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  patch(changes: Partial<RuntimeState>): void {
    const prev = this._state;
    this._state = { ...this._state, ...changes };
    this.notifyListeners(prev);
  }

  setGraph(graph: UIGraph): void {
    const diff = this.computeDiff(this._state.currentGraph, graph);
    this.patch({
      previousGraph: this._state.currentGraph,
      currentGraph: graph,
      pageId: graph.pageId,
      currentUrl: graph.url,
      currentTitle: graph.title,
      lastExtractedAt: graph.timestamp,
      activeModalIds: graph.modalIds,
      extractionInProgress: false,
    });
    this.logEvent('GRAPH_UPDATED', { checksum: graph.checksum, diff });
  }

  setLoading(isLoading: boolean): void {
    this.patch({ isLoading });
    this.logEvent(isLoading ? 'LOADING_STARTED' : 'LOADING_ENDED', {});
  }

  setReady(): void {
    this.patch({ isReady: true, isLoading: false });
    this.logEvent('RUNTIME_READY', { url: this._state.currentUrl });
  }

  markExtractionStarted(): void {
    this.patch({ extractionInProgress: true });
  }

  recordRouteChange(url: string, title: string): void {
    this.patch({
      currentUrl: url,
      currentTitle: title,
      routeChangedAt: Date.now(),
      currentGraph: null,
      extractionInProgress: false,
    });
    this.logEvent('ROUTE_CHANGED', { url, title });
  }

  incrementMutations(): void {
    this.patch({ mutationCount: this._state.mutationCount + 1 });
  }

  addPendingAction(action: ActionRequest): void {
    this.pendingActions.set(action.id, action);
    this.patch({ pendingActionIds: Array.from(this.pendingActions.keys()) });
  }

  removePendingAction(actionId: string): void {
    this.pendingActions.delete(actionId);
    this.patch({ pendingActionIds: Array.from(this.pendingActions.keys()) });
  }

  logEvent(type: string, payload: unknown): void {
    if (this.eventLog.length >= this.maxEventLogSize) {
      this.eventLog.shift();
    }
    this.eventLog.push({ type, timestamp: Date.now(), payload });
  }

  getEventLog(): Array<{ type: string; timestamp: number; payload: unknown }> {
    return [...this.eventLog];
  }

  private computeDiff(prev: UIGraph | null, next: UIGraph): GraphDiff {
    if (!prev) {
      return {
        added: next.elements,
        removed: [],
        modified: [],
        unchanged: 0,
        checksumChanged: true,
      };
    }
    const prevMap = prev.elementMap;
    const nextMap = next.elementMap;
    const added = next.elements.filter((el) => !prevMap[el.id]);
    const removed = prev.elements.filter((el) => !nextMap[el.id]);
    const modified = next.elements.filter((el) => {
      const p = prevMap[el.id];
      if (!p) return false;
      return el.text !== p.text || el.enabled !== p.enabled || el.visible !== p.visible;
    });
    const unchanged = next.elements.length - added.length - modified.length;
    return { added, removed, modified, unchanged, checksumChanged: prev.checksum !== next.checksum };
  }

  private notifyListeners(prev: Readonly<RuntimeState>): void {
    for (const listener of this.listeners) {
      try {
        listener(this._state, prev);
      } catch {
        // listener errors must not crash the runtime
      }
    }
  }
}
