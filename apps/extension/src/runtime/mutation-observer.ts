export type MutationCategory =
  | 'structural'
  | 'attribute'
  | 'text'
  | 'route-change'
  | 'modal-appeared'
  | 'modal-dismissed'
  | 'loading-started'
  | 'loading-ended'
  | 'form-changed'
  | 'visibility-changed';

export interface MutationBatch {
  readonly categories: Set<MutationCategory>;
  readonly addedSubtrees: Element[];
  readonly removedNodes: Array<{ hhId: string | null; node: Node }>;
  readonly modifiedHhIds: string[];
  readonly timestamp: number;
  readonly mutationCount: number;
}

export type MutationBatchHandler = (batch: MutationBatch) => void;

const LOADING_CLASS_PATTERNS = /\b(loading|skeleton|spinner|progress|pending)\b/i;
const MODAL_SELECTORS = ['dialog', '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]'];

export class SmartMutationObserver {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private urlCheckInterval: ReturnType<typeof setInterval> | null = null;
  private pendingMutations: MutationRecord[] = [];
  private readonly handlers = new Set<MutationBatchHandler>();
  private lastKnownUrl = window.location.href;
  private readonly debounceMs: number;
  private mutationCount = 0;
  private isObserving = false;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  onMutation(handler: MutationBatchHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start(): void {
    if (this.isObserving) return;
    this.isObserving = true;

    this.observer = new MutationObserver((mutations) => {
      this.pendingMutations.push(...mutations);
      this.mutationCount += mutations.length;
      this.scheduleBatch();
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'aria-expanded',
        'aria-hidden',
        'aria-modal',
        'aria-disabled',
        'disabled',
        'class',
        'style',
        'hidden',
        'data-hh-id',
      ],
      characterData: false,
    });

    this.interceptHistoryApi();
    this.startUrlPolling();
  }

  stop(): void {
    if (!this.isObserving) return;
    this.isObserving = false;

    this.observer?.disconnect();
    this.observer = null;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    this.pendingMutations = [];
  }

  private scheduleBatch(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flushBatch(), this.debounceMs);
  }

  private flushBatch(): void {
    if (this.pendingMutations.length === 0) return;

    const mutations = this.pendingMutations.splice(0);
    const batch = this.buildBatch(mutations);
    this.notifyHandlers(batch);
  }

  private buildBatch(mutations: MutationRecord[]): MutationBatch {
    const categories = new Set<MutationCategory>();
    const addedSubtrees: Element[] = [];
    const removedNodes: MutationBatch['removedNodes'] = [];
    const modifiedHhIds: string[] = [];
    const seenAdded = new WeakSet<Element>();
    const seenRemoved = new WeakSet<Node>();

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (seenAdded.has(node)) continue;

          const cats = this.classifyAddedNode(node);
          for (const c of cats) categories.add(c);

          // Only add the highest ancestor we haven't seen yet
          const alreadyCovered = addedSubtrees.some((s) => s.contains(node));
          if (!alreadyCovered) {
            addedSubtrees.push(node);
            seenAdded.add(node);
          }
        }

        for (const node of mutation.removedNodes) {
          if (seenRemoved.has(node)) continue;
          seenRemoved.add(node);
          categories.add('structural');
          const hhId =
            node instanceof Element ? node.getAttribute('data-hh-id') : null;
          removedNodes.push({ hhId, node });

          // Also collect data-hh-id from all descendants of removed node
          if (node instanceof Element) {
            for (const desc of node.querySelectorAll('[data-hh-id]')) {
              const descId = desc.getAttribute('data-hh-id');
              if (descId) removedNodes.push({ hhId: descId, node: desc });
            }
          }
        }
      }

      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        const target = mutation.target;
        const attr = mutation.attributeName;
        const hhId = target.getAttribute('data-hh-id');

        if (attr === 'aria-hidden' || attr === 'hidden' || attr === 'style') {
          categories.add('visibility-changed');
        }
        if (attr === 'aria-expanded') {
          categories.add('attribute');
        }
        if (attr === 'class') {
          const cls = target.className;
          if (LOADING_CLASS_PATTERNS.test(cls)) {
            categories.add('loading-started');
          } else {
            categories.add('attribute');
          }
        }
        if (attr === 'disabled' || attr === 'aria-disabled') {
          categories.add('attribute');
        }

        if (hhId && !modifiedHhIds.includes(hhId)) {
          modifiedHhIds.push(hhId);
        }
      }
    }

    // Detect loading-ended: if loading-started was in previous batch but no loading indicators present now
    if (!categories.has('loading-started')) {
      const hasLoadingIndicators = !!document.querySelector(
        '[class*="loading"], [class*="skeleton"], [class*="spinner"]',
      );
      if (!hasLoadingIndicators && this.mutationCount > 0) {
        // Might be loading-ended — conservative detection
      }
    }

    if (categories.size === 0) categories.add('structural');

    return {
      categories,
      addedSubtrees,
      removedNodes,
      modifiedHhIds,
      timestamp: Date.now(),
      mutationCount: this.mutationCount,
    };
  }

  private classifyAddedNode(node: Element): MutationCategory[] {
    const categories: MutationCategory[] = ['structural'];
    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role');

    const isModal =
      tag === 'dialog' ||
      MODAL_SELECTORS.some((sel) => node.matches(sel)) ||
      node.querySelector(MODAL_SELECTORS.join(', ')) !== null;

    if (isModal) categories.push('modal-appeared');

    if (LOADING_CLASS_PATTERNS.test(node.className)) {
      categories.push('loading-started');
    }

    if (tag === 'form' || node.querySelector('form')) {
      categories.push('form-changed');
    }

    return categories;
  }

  private interceptHistoryApi(): void {
    const original_pushState = history.pushState.bind(history);
    const original_replaceState = history.replaceState.bind(history);

    history.pushState = (...args) => {
      original_pushState(...args);
      this.handleUrlChange();
    };

    history.replaceState = (...args) => {
      original_replaceState(...args);
      this.handleUrlChange();
    };

    window.addEventListener('popstate', () => this.handleUrlChange(), { passive: true });
    window.addEventListener('hashchange', () => this.handleUrlChange(), { passive: true });
  }

  private startUrlPolling(): void {
    this.urlCheckInterval = setInterval(() => {
      const current = window.location.href;
      if (current !== this.lastKnownUrl) {
        this.lastKnownUrl = current;
        this.handleUrlChange();
      }
    }, 600);
  }

  private handleUrlChange(): void {
    const newUrl = window.location.href;
    if (newUrl === this.lastKnownUrl) return;
    this.lastKnownUrl = newUrl;

    const routeBatch: MutationBatch = {
      categories: new Set(['route-change']),
      addedSubtrees: [],
      removedNodes: [],
      modifiedHhIds: [],
      timestamp: Date.now(),
      mutationCount: this.mutationCount,
    };
    this.notifyHandlers(routeBatch);
  }

  private notifyHandlers(batch: MutationBatch): void {
    for (const handler of this.handlers) {
      try {
        handler(batch);
      } catch {
        // handler errors must not crash the observer
      }
    }
  }
}
