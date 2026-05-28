import type { UIElement, UIElementRole, BoundingRect, SelectorMetadata } from '@humanhands/shared-types';

interface ExtractScriptArgs {
  sessionId: string;
  pageId: string;
}

/**
 * Serializable DOM extraction script injected via page.evaluate().
 * Must be entirely self-contained — no imports, no closures referencing outer scope.
 */
function extractScript(args: ExtractScriptArgs): UIElement[] {
  const { sessionId, pageId } = args;
  const EXTRACTABLE = [
    'button', 'a[href]', 'input:not([type="hidden"])', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="checkbox"]',
    '[role="combobox"]', '[role="listbox"]', '[role="tab"]', '[role="menuitem"]',
    '[role="dialog"]', '[contenteditable="true"]', 'form', 'nav',
    'h1,h2,h3,h4,h5,h6', '[aria-label]', '[data-testid]',
  ].join(',');

  const rawEls = document.querySelectorAll<HTMLElement>(EXTRACTABLE);
  const elements: UIElement[] = [];
  const seen = new WeakSet<HTMLElement>();
  const idCounter = new Map<string, number>();

  function resolveRole(tag: string, ariaRole?: string, inputType?: string): UIElementRole {
    if (ariaRole === 'button') return 'button';
    if (ariaRole === 'link') return 'link';
    if (ariaRole === 'checkbox') return 'checkbox';
    if (ariaRole === 'radio') return 'radio';
    if (ariaRole === 'tab') return 'tab';
    if (ariaRole === 'menuitem') return 'menu-item';
    if (ariaRole === 'dialog') return 'dialog';
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    if (tag === 'form') return 'form';
    if (tag === 'nav') return 'nav';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      if (inputType === 'checkbox') return 'checkbox';
      if (inputType === 'radio') return 'radio';
      if (inputType === 'submit' || inputType === 'button') return 'button';
      return 'input';
    }
    return 'generic';
  }

  function stableId(role: string, selector: string): string {
    const key = `${role}_${selector.slice(0, 20)}`;
    const n = (idCounter.get(key) ?? 0) + 1;
    idCounter.set(key, n);
    let h = 0;
    for (let i = 0; i < key.length; i++) { h = (h << 5) - h + key.charCodeAt(i); h |= 0; }
    return `${role}_${Math.abs(h).toString(36)}${n > 1 ? `_${n}` : ''}`;
  }

  function primarySelector(el: HTMLElement): string {
    const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-cy');
    if (testId) return `[data-testid="${testId}"]`;
    if (el.id && !/^\d|react-|ng-/.test(el.id)) return `#${el.id}`;
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
    const name = el.getAttribute('name');
    if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
    return el.tagName.toLowerCase();
  }

  function isVisible(el: HTMLElement): boolean {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  for (const el of rawEls) {
    if (seen.has(el)) continue;
    seen.add(el);
    const tag = el.tagName.toLowerCase();
    const ariaRole = el.getAttribute('role') ?? undefined;
    const inputType = el instanceof HTMLInputElement ? el.type : undefined;
    const role = resolveRole(tag, ariaRole, inputType);
    const sel = primarySelector(el);
    const id = stableId(role, sel);
    el.setAttribute('data-hh-id', id);

    const rect = el.getBoundingClientRect();
    const bounds: BoundingRect = {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      top: Math.round(rect.top), right: Math.round(rect.right),
      bottom: Math.round(rect.bottom), left: Math.round(rect.left),
    };

    const selector: SelectorMetadata = {
      primary: sel,
      fallbacks: el.getAttribute('aria-label') ? [`[aria-label="${el.getAttribute('aria-label')}"]`] : [],
    };

    const visible = isVisible(el);
    const disabled =
      (el as HTMLInputElement).disabled ||
      el.getAttribute('aria-disabled') === 'true';

    const interactableRoles: UIElementRole[] = ['button','input','textarea','select','link','checkbox','radio','tab','menu-item'];

    elements.push({
      id, role, tagName: tag,
      text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 200),
      placeholder: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? el.placeholder : undefined,
      value: (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) ? el.value : undefined,
      href: el instanceof HTMLAnchorElement ? el.href : undefined,
      inputType,
      selector,
      visible,
      enabled: !disabled,
      interactable: visible && !disabled && interactableRoles.includes(role),
      bounds,
      accessibility: {
        ariaRole,
        ariaLabel: el.getAttribute('aria-label') ?? undefined,
        ariaExpanded: el.getAttribute('aria-expanded') ? el.getAttribute('aria-expanded') === 'true' : undefined,
        ariaDisabled: el.getAttribute('aria-disabled') ? el.getAttribute('aria-disabled') === 'true' : undefined,
        focusable: ['a','button','input','select','textarea'].includes(tag),
        keyboardAccessible: ['a','button','input','select','textarea'].includes(tag),
      },
      attributes: Object.fromEntries(
        Array.from(el.attributes)
          .filter(a => !['class','style','data-hh-id'].includes(a.name))
          .map(a => [a.name, a.value])
      ),
      parentId: null,
      childIds: [],
      depth: (() => { let d=0, p=el.parentElement; while(p && d<50){d++;p=p.parentElement;} return d; })(),
      pageId,
      extractedAt: Date.now(),
    });
  }

  // Wire parent-child
  for (const el of elements) {
    const domEl = document.querySelector<HTMLElement>(`[data-hh-id="${el.id}"]`);
    if (!domEl) continue;
    let parent = domEl.parentElement;
    while (parent) {
      const pid = parent.getAttribute('data-hh-id');
      if (pid) { el.parentId = pid; break; }
      parent = parent.parentElement;
    }
  }

  return elements;
}

export const DomExtractor = { extractScript };
