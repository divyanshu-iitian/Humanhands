import type { ActionRequest, ActionResult, ActionErrorCode } from '@humanhands/shared-types';

type ActionHandler = (request: ActionRequest) => Promise<Partial<ActionResult>>;

const handlers: Partial<Record<string, ActionHandler>> = {
  click: async (req) => {
    const el = resolveElement(req);
    if (!el) return failure('ELEMENT_NOT_FOUND', `Element not found for selector`);
    if (!isInteractable(el)) return failure('ELEMENT_NOT_INTERACTABLE', 'Element is not interactable');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await tick();
    el.click();
    return { success: true };
  },

  type: async (req) => {
    const el = resolveElement(req);
    if (!el) return failure('ELEMENT_NOT_FOUND', `Element not found`);
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      return failure('ELEMENT_NOT_INTERACTABLE', 'Element is not a text input');
    }
    if (req.options?.clearBeforeType) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.focus();
    el.value = req.value ?? '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (req.options?.pressEnterAfterType) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    }
    return { success: true };
  },

  select: async (req) => {
    const el = resolveElement(req);
    if (!el) return failure('ELEMENT_NOT_FOUND', `Element not found`);
    if (!(el instanceof HTMLSelectElement)) {
      return failure('ELEMENT_NOT_INTERACTABLE', 'Element is not a <select>');
    }
    el.value = req.value ?? '';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  },

  extractText: async (req) => {
    const el = resolveElement(req);
    if (!el) return failure('ELEMENT_NOT_FOUND', `Element not found`);
    const text = (el.textContent ?? '').trim();
    return { success: true, extractedText: text, data: { text } };
  },

  focus: async (req) => {
    const el = resolveElement(req);
    if (!el || !(el instanceof HTMLElement)) return failure('ELEMENT_NOT_FOUND', 'Element not found');
    el.focus();
    return { success: true };
  },

  scroll: async (req) => {
    const el = resolveElement(req);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollBy(0, parseInt(req.value ?? '300'));
    }
    return { success: true };
  },
};

export async function executeAction(request: ActionRequest): Promise<ActionResult> {
  const start = Date.now();
  const handler = handlers[request.type];

  if (!handler) {
    return buildResult(request, start, false, {
      code: 'ACTION_NOT_SUPPORTED',
      message: `Action type '${request.type}' not supported in content script`,
      retryable: false,
    });
  }

  try {
    const partial = await handler(request);
    return buildResult(request, start, partial.success ?? false, partial.error, partial);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildResult(request, start, false, { code: 'UNKNOWN', message: msg, retryable: true });
  }
}

function resolveElement(req: ActionRequest): Element | null {
  if (!req.target) return null;

  if (req.target.kind === 'selector') {
    return document.querySelector(req.target.selector);
  }
  if (req.target.kind === 'element-id') {
    return document.querySelector(`[data-hh-id="${req.target.elementId}"]`);
  }
  if (req.target.kind === 'text') {
    const role = req.target.role ?? '*';
    const all = document.querySelectorAll(role);
    for (const el of all) {
      if (el.textContent?.trim().toLowerCase().includes(req.target.text.toLowerCase())) {
        return el;
      }
    }
    return null;
  }
  return null;
}

function isInteractable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el instanceof HTMLInputElement && el.disabled) return false;
  return true;
}

function failure(
  code: ActionErrorCode,
  message: string,
): Partial<ActionResult> {
  return { success: false, error: { code, message, retryable: code !== 'ACTION_NOT_SUPPORTED' } };
}

function buildResult(
  req: ActionRequest,
  start: number,
  success: boolean,
  error?: Partial<ActionResult>['error'],
  partial?: Partial<ActionResult>,
): ActionResult {
  return {
    actionId: req.id,
    sessionId: req.sessionId,
    type: req.type,
    success,
    timestamp: start,
    duration: Date.now() - start,
    retryCount: 0,
    error: error as ActionResult['error'],
    extractedText: partial?.extractedText,
    data: partial?.data,
  };
}

function tick(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
