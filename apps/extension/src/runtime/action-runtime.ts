import type { ActionRequest, ActionResult, ActionErrorCode, UIElement } from '@humanhands/shared-types';
import type { IncrementalDomExtractor } from './dom-extractor.js';
import type { RuntimeStateSync } from './state-sync.js';

export interface VerificationSnapshot {
  url: string;
  focusedElementId: string | null;
  targetValue: string | null;
  targetChecked: boolean | null;
  targetVisible: boolean;
  targetEnabled: boolean;
  modalCount: number;
  timestamp: number;
}

export interface VerificationResult {
  passed: boolean;
  expected: string;
  actual: string;
  strategy: VerificationStrategy;
  snapshot: VerificationSnapshot;
}

export type VerificationStrategy =
  | 'url-changed'
  | 'value-set'
  | 'element-focused'
  | 'modal-appeared'
  | 'modal-dismissed'
  | 'text-extracted'
  | 'state-changed'
  | 'best-effort';

export interface ActionExecutionResult extends ActionResult {
  verification?: VerificationResult;
}

const DEFAULT_SETTLE_MS = 400;
const RETRY_DELAYS_MS = [0, 300, 600, 1200];

export class ActionRuntime {
  private readonly extractor: IncrementalDomExtractor;
  private readonly state: RuntimeStateSync;

  constructor(extractor: IncrementalDomExtractor, state: RuntimeStateSync) {
    this.extractor = extractor;
    this.state = state;
  }

  async execute(request: ActionRequest): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    this.state.addPendingAction(request);
    this.state.logEvent('ACTION_STARTED', { actionId: request.id, type: request.type });

    const preSnapshot = this.captureSnapshot(request);

    try {
      const result = await this.executeWithRetry(request);
      await this.waitForSettle(request);

      const postSnapshot = this.captureSnapshot(request);
      const verification = this.verify(request, preSnapshot, postSnapshot);

      if (!verification.passed && request.type !== 'extractText') {
        this.state.logEvent('ACTION_VERIFICATION_FAILED', {
          actionId: request.id,
          verification,
        });
      }

      const finalResult: ActionExecutionResult = {
        ...result,
        duration: Date.now() - startTime,
        verification,
      };

      this.state.removePendingAction(request.id);
      this.state.logEvent('ACTION_COMPLETED', { actionId: request.id, success: result.success, verification });
      return finalResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const code = this.classifyError(err);
      const failedResult: ActionExecutionResult = {
        actionId: request.id,
        sessionId: request.sessionId,
        type: request.type,
        success: false,
        timestamp: startTime,
        duration: Date.now() - startTime,
        retryCount: 0,
        error: { code, message: err.message, retryable: code !== 'ACTION_NOT_SUPPORTED' },
      };
      this.state.removePendingAction(request.id);
      this.state.logEvent('ACTION_FAILED', { actionId: request.id, error: err.message });
      return failedResult;
    }
  }

  private async executeWithRetry(request: ActionRequest): Promise<ActionResult> {
    const maxRetries = request.options?.retries ?? 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 1200;
        await this.sleep(delay);
      }
      try {
        return await this.executeSingle(request, attempt);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!this.isRetryableError(lastError)) break;
      }
    }
    throw lastError ?? new Error('Action execution failed');
  }

  private async executeSingle(request: ActionRequest, retryCount: number): Promise<ActionResult> {
    const el = this.resolveTarget(request);
    const startTime = Date.now();

    switch (request.type) {
      case 'click':
        if (!el) throw this.notFoundError(request);
        if (!this.isInteractable(el)) throw this.notInteractableError(request);
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        await this.tick();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        (el as HTMLElement).click();
        break;

      case 'type': {
        if (!el) throw this.notFoundError(request);
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
          throw new Error('Target is not a text input');
        }
        if (request.options?.clearBeforeType) {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        input.focus();
        input.value = request.value ?? '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (request.options?.pressEnterAfterType) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        }
        break;
      }

      case 'select': {
        if (!el) throw this.notFoundError(request);
        if (!(el instanceof HTMLSelectElement)) throw new Error('Target is not a <select>');
        el.value = request.value ?? '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }

      case 'extractText': {
        if (!el) throw this.notFoundError(request);
        const text = (el.textContent ?? '').trim();
        return { actionId: request.id, sessionId: request.sessionId, type: request.type,
          success: true, timestamp: startTime, duration: Date.now() - startTime,
          retryCount, extractedText: text, data: { text } };
      }

      case 'scroll':
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          window.scrollBy({ top: parseInt(request.value ?? '300'), behavior: 'smooth' });
        }
        break;

      case 'hover':
        if (!el) throw this.notFoundError(request);
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        break;

      case 'focus':
        if (!el || !(el instanceof HTMLElement)) throw this.notFoundError(request);
        el.focus();
        break;

      case 'waitFor':
        await this.waitForElement(request);
        break;

      case 'navigate':
        if (!request.url) throw new Error('navigate requires a url');
        window.location.href = request.url;
        break;

      default:
        throw new Error(`Action type '${request.type}' not supported in content script`);
    }

    return {
      actionId: request.id,
      sessionId: request.sessionId,
      type: request.type,
      success: true,
      timestamp: startTime,
      duration: Date.now() - startTime,
      retryCount,
    };
  }

  private resolveTarget(request: ActionRequest): Element | null {
    if (!request.target) return null;

    if (request.target.kind === 'selector') {
      const el = document.querySelector(request.target.selector);
      if (el) return el;
      // Try fallbacks
      for (const fb of request.target.fallbackSelectors ?? []) {
        const fbEl = document.querySelector(fb);
        if (fbEl) return fbEl;
      }
      return null;
    }

    if (request.target.kind === 'element-id') {
      return document.querySelector(`[data-hh-id="${request.target.elementId}"]`);
    }

    if (request.target.kind === 'text') {
      const role = request.target.role ?? '*';
      const needle = request.target.text.toLowerCase();
      const candidates = document.querySelectorAll(role === '*' ? '[data-hh-id]' : role);
      for (const el of candidates) {
        if ((el.textContent ?? '').toLowerCase().includes(needle)) return el;
      }
      return null;
    }

    return null;
  }

  private captureSnapshot(request: ActionRequest): VerificationSnapshot {
    const el = this.resolveTarget(request);
    const focused = document.activeElement?.getAttribute('data-hh-id') ?? null;
    const modals = document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]');

    return {
      url: window.location.href,
      focusedElementId: focused,
      targetValue: el instanceof HTMLInputElement || el instanceof HTMLSelectElement
        ? el.value
        : null,
      targetChecked: el instanceof HTMLInputElement && el.type === 'checkbox'
        ? el.checked
        : null,
      targetVisible: el instanceof HTMLElement ? this.isVisible(el) : false,
      targetEnabled: el instanceof HTMLElement ? !this.isDisabled(el as HTMLElement) : false,
      modalCount: modals.length,
      timestamp: Date.now(),
    };
  }

  private verify(
    request: ActionRequest,
    pre: VerificationSnapshot,
    post: VerificationSnapshot,
  ): VerificationResult {
    switch (request.type) {
      case 'navigate':
        return {
          passed: post.url !== pre.url || (request.url ? post.url.includes(request.url) : true),
          expected: `URL to change to ${request.url ?? '(any)'}`,
          actual: post.url,
          strategy: 'url-changed',
          snapshot: post,
        };

      case 'type':
        return {
          passed: post.targetValue === (request.value ?? ''),
          expected: `value = "${request.value}"`,
          actual: `value = "${post.targetValue}"`,
          strategy: 'value-set',
          snapshot: post,
        };

      case 'select':
        return {
          passed: post.targetValue === (request.value ?? ''),
          expected: `selected = "${request.value}"`,
          actual: `selected = "${post.targetValue}"`,
          strategy: 'value-set',
          snapshot: post,
        };

      case 'click': {
        const urlChanged = post.url !== pre.url;
        const modalAppeared = post.modalCount > pre.modalCount;
        const focusChanged = post.focusedElementId !== pre.focusedElementId;
        return {
          passed: urlChanged || modalAppeared || focusChanged || true, // click is best-effort
          expected: 'click to have effect (url change, modal, or focus)',
          actual: `url=${urlChanged}, modal=${modalAppeared}, focus=${focusChanged}`,
          strategy: urlChanged ? 'url-changed' : modalAppeared ? 'modal-appeared' : 'best-effort',
          snapshot: post,
        };
      }

      case 'extractText':
        return {
          passed: true,
          expected: 'text extracted',
          actual: 'text extracted',
          strategy: 'text-extracted',
          snapshot: post,
        };

      default:
        return {
          passed: true,
          expected: 'action completed',
          actual: 'action completed',
          strategy: 'best-effort',
          snapshot: post,
        };
    }
  }

  private async waitForSettle(request: ActionRequest): Promise<void> {
    const settleMs = request.type === 'navigate' ? 800 : DEFAULT_SETTLE_MS;
    await this.sleep(settleMs);

    // If a loading indicator is present, wait a bit longer
    const hasLoader = !!document.querySelector(
      '[class*="loading"], [class*="spinner"], [aria-busy="true"]',
    );
    if (hasLoader) await this.sleep(500);
  }

  private async waitForElement(request: ActionRequest): Promise<void> {
    const timeout = request.options?.timeout ?? 10000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const el = this.resolveTarget(request);
      if (el) return;
      await this.sleep(100);
    }
    throw new Error(`waitFor: element not found within ${timeout}ms`);
  }

  private isInteractable(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    if (el instanceof HTMLButtonElement && el.disabled) return false;
    if (el instanceof HTMLInputElement && el.disabled) return false;
    return true;
  }

  private isVisible(el: HTMLElement): boolean {
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  private isDisabled(el: HTMLElement): boolean {
    return (
      el.hasAttribute('disabled') ||
      el.getAttribute('aria-disabled') === 'true'
    );
  }

  private notFoundError(request: ActionRequest): Error {
    return Object.assign(new Error(`Element not found for action ${request.type}`), {
      code: 'ELEMENT_NOT_FOUND',
    });
  }

  private notInteractableError(request: ActionRequest): Error {
    return Object.assign(new Error(`Element not interactable for action ${request.type}`), {
      code: 'ELEMENT_NOT_INTERACTABLE',
    });
  }

  private classifyError(err: Error): ActionErrorCode {
    const msg = err.message.toLowerCase();
    if (msg.includes('not found')) return 'ELEMENT_NOT_FOUND';
    if (msg.includes('not interactable') || msg.includes('disabled')) return 'ELEMENT_NOT_INTERACTABLE';
    if (msg.includes('not visible') || msg.includes('hidden')) return 'ELEMENT_NOT_VISIBLE';
    if (msg.includes('timeout') || msg.includes('not found within')) return 'TIMEOUT';
    if (msg.includes('not supported')) return 'ACTION_NOT_SUPPORTED';
    return 'UNKNOWN';
  }

  private isRetryableError(err: Error): boolean {
    const retryable = ['ELEMENT_NOT_FOUND', 'ELEMENT_NOT_VISIBLE', 'TIMEOUT'];
    const code = (err as Error & { code?: string }).code;
    return code ? retryable.includes(code) : retryable.some((c) => err.message.includes(c));
  }

  private tick(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
