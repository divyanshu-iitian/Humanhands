export type ObserverCallback = (reason: MutationReason) => void;

export type MutationReason =
  | 'dom-mutation'
  | 'route-change'
  | 'modal-appeared'
  | 'loading-state-change';

export interface ObserverOptions {
  debounceMs?: number;
  observeSubtree?: boolean;
}

export class PageObserver {
  private mutationObserver: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly callback: ObserverCallback;
  private readonly debounceMs: number;
  private lastUrl: string = window.location.href;
  private urlCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(callback: ObserverCallback, options: ObserverOptions = {}) {
    this.callback = callback;
    this.debounceMs = options.debounceMs ?? 300;
  }

  start(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      const reason = this.classifyMutations(mutations);
      if (reason) this.debouncedNotify(reason);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded', 'aria-hidden', 'disabled', 'class'],
      characterData: false,
    });

    // SPA route detection via polling — MutationObserver can't reliably catch pushState
    this.urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
        this.debouncedNotify('route-change');
      }
    }, 500);

    // Listen for history API navigation
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args) => {
      originalPushState(...args);
      this.debouncedNotify('route-change');
    };

    history.replaceState = (...args) => {
      originalReplaceState(...args);
      this.debouncedNotify('route-change');
    };

    window.addEventListener('popstate', () => this.debouncedNotify('route-change'));
  }

  stop(): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;

    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private classifyMutations(mutations: MutationRecord[]): MutationReason | null {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const role = node.getAttribute('role');
          if (role === 'dialog' || role === 'alertdialog' || role === 'modal') {
            return 'modal-appeared';
          }
          const tag = node.tagName?.toLowerCase();
          if (tag === 'dialog') return 'modal-appeared';
        }
        return 'dom-mutation';
      }

      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        const attr = mutation.attributeName;
        if (attr === 'aria-hidden' || attr === 'aria-expanded') {
          return 'dom-mutation';
        }
        if (attr === 'class') {
          const classes = mutation.target.classList;
          if (classes.contains('loading') || classes.contains('skeleton')) {
            return 'loading-state-change';
          }
        }
      }
    }

    return 'dom-mutation';
  }

  private debouncedNotify(reason: MutationReason): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.callback(reason);
    }, this.debounceMs);
  }
}
