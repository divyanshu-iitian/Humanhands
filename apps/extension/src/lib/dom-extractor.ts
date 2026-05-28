import type {
  UIElement,
  UIElementRole,
  BoundingRect,
  SelectorMetadata,
} from '@humanhands/shared-types';
import { extractAccessibilityMetadata } from './accessibility-parser.js';

const EXTRACTABLE_SELECTORS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="dialog"]',
  '[contenteditable="true"]',
  'form',
  'nav',
  'h1, h2, h3, h4, h5, h6',
  'table',
  '[aria-label]',
  '[data-testid]',
].join(', ');

export interface ExtractionOptions {
  sessionId: string;
  pageId: string;
  includeHidden?: boolean;
  maxDepth?: number;
}

export interface ExtractionResult {
  elements: UIElement[];
  extractedAt: number;
  url: string;
  title: string;
}

export class DomExtractor {
  extract(options: ExtractionOptions): ExtractionResult {
    const rawElements = document.querySelectorAll<HTMLElement>(EXTRACTABLE_SELECTORS);
    const elements: UIElement[] = [];
    const seen = new Set<HTMLElement>();
    const idCounter = new Map<string, number>();

    for (const el of rawElements) {
      if (seen.has(el)) continue;
      seen.add(el);

      if (!options.includeHidden && !this.isVisible(el)) continue;

      const extracted = this.extractElement(el, options, idCounter);
      if (extracted) elements.push(extracted);
    }

    this.wireParentChildRelationships(elements);

    return {
      elements,
      extractedAt: Date.now(),
      url: window.location.href,
      title: document.title,
    };
  }

  private extractElement(
    el: HTMLElement,
    options: ExtractionOptions,
    idCounter: Map<string, number>,
  ): UIElement | null {
    const tagName = el.tagName.toLowerCase();
    const inputType = el instanceof HTMLInputElement ? el.type : undefined;
    const ariaRole = el.getAttribute('role') ?? undefined;
    const role = this.resolveRole(tagName, ariaRole, inputType);

    const text = this.extractText(el);
    const bounds = this.extractBounds(el);
    const accessibility = extractAccessibilityMetadata(el);
    const selector = this.generateSelector(el);
    const stableId = this.generateStableId(role, selector.primary, idCounter);
    const attributes = this.extractAttributes(el);
    const visible = this.isVisible(el);
    const enabled = !this.isDisabled(el);

    el.setAttribute('data-hh-id', stableId);

    const interactableRoles: UIElementRole[] = [
      'button', 'input', 'textarea', 'select', 'link', 'checkbox', 'radio', 'tab', 'menu-item',
    ];

    const element: UIElement = {
      id: stableId,
      role,
      tagName,
      text,
      placeholder: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.placeholder ?? undefined
        : undefined,
      value: el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
        ? el.value ?? undefined
        : undefined,
      href: el instanceof HTMLAnchorElement ? el.href ?? undefined : undefined,
      inputType,
      selector,
      visible,
      enabled,
      interactable: visible && enabled && interactableRoles.includes(role),
      bounds,
      accessibility,
      attributes,
      parentId: null,
      childIds: [],
      depth: this.getDepth(el),
      pageId: options.pageId,
      extractedAt: Date.now(),
    };

    return element;
  }

  private wireParentChildRelationships(elements: UIElement[]): void {
    const byNativeId = new Map<string, UIElement>();

    for (const el of elements) {
      const domEl = document.querySelector(`[data-hh-id="${el.id}"]`);
      if (domEl) byNativeId.set(el.id, el);
    }

    for (const el of elements) {
      const domEl = document.querySelector<HTMLElement>(`[data-hh-id="${el.id}"]`);
      if (!domEl) continue;

      let parent = domEl.parentElement;
      while (parent) {
        const parentHhId = parent.getAttribute('data-hh-id');
        if (parentHhId && byNativeId.has(parentHhId)) {
          el.parentId = parentHhId;
          const parentEl = byNativeId.get(parentHhId);
          if (parentEl && !parentEl.childIds.includes(el.id)) {
            parentEl.childIds.push(el.id);
          }
          break;
        }
        parent = parent.parentElement;
      }
    }
  }

  private resolveRole(
    tagName: string,
    ariaRole: string | undefined,
    inputType: string | undefined,
  ): UIElementRole {
    if (ariaRole === 'button') return 'button';
    if (ariaRole === 'link') return 'link';
    if (ariaRole === 'checkbox') return 'checkbox';
    if (ariaRole === 'radio') return 'radio';
    if (ariaRole === 'tab') return 'tab';
    if (ariaRole === 'menuitem') return 'menu-item';
    if (ariaRole === 'dialog') return 'dialog';

    if (tagName === 'button') return 'button';
    if (tagName === 'a') return 'link';
    if (tagName === 'textarea') return 'textarea';
    if (tagName === 'select') return 'select';
    if (tagName === 'form') return 'form';
    if (tagName === 'nav') return 'nav';
    if (tagName === 'table') return 'table';
    if (tagName === 'tr') return 'table-row';
    if (tagName === 'td') return 'table-cell';
    if (tagName === 'th') return 'table-header';
    if (/^h[1-6]$/.test(tagName)) return 'heading';

    if (tagName === 'input') {
      if (inputType === 'checkbox') return 'checkbox';
      if (inputType === 'radio') return 'radio';
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') return 'button';
      return 'input';
    }

    return 'generic';
  }

  private generateSelector(el: HTMLElement): SelectorMetadata {
    const fallbacks: string[] = [];

    const dataTestId =
      el.getAttribute('data-testid') ??
      el.getAttribute('data-cy') ??
      el.getAttribute('data-qa');

    if (dataTestId) {
      const testIdSelector = `[data-testid="${dataTestId}"]`;
      return { primary: testIdSelector, fallbacks: [], dataTestId: testIdSelector };
    }

    if (el.id && !this.isUnstableId(el.id)) {
      const primary = `#${CSS.escape(el.id)}`;
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) fallbacks.push(`[aria-label="${ariaLabel}"]`);
      fallbacks.push(`${el.tagName.toLowerCase()}[name="${el.getAttribute('name') ?? ''}"]`);
      return { primary, fallbacks: fallbacks.filter(Boolean) };
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const primary = `[aria-label="${ariaLabel}"]`;
      const tag = el.tagName.toLowerCase();
      fallbacks.push(`${tag}[aria-label="${ariaLabel}"]`);
      return { primary, fallbacks, semantic: primary };
    }

    const name = el.getAttribute('name');
    if (name) {
      const primary = `${el.tagName.toLowerCase()}[name="${name}"]`;
      return { primary, fallbacks };
    }

    const cssSelector = this.buildCssSelector(el);
    return { primary: cssSelector, fallbacks };
  }

  private buildCssSelector(el: HTMLElement): string {
    const parts: string[] = [el.tagName.toLowerCase()];
    const stableClasses = Array.from(el.classList).filter((c) => !this.isDynamicClass(c));
    if (stableClasses.length > 0) {
      parts.push(stableClasses.slice(0, 2).map((c) => `.${CSS.escape(c)}`).join(''));
    }
    const type = el.getAttribute('type');
    if (type) parts.push(`[type="${type}"]`);
    return parts.join('');
  }

  private extractText(el: HTMLElement): string {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const text = el instanceof HTMLInputElement
      ? el.placeholder ?? el.value ?? ''
      : el.textContent ?? '';

    return text.trim().slice(0, 200);
  }

  private extractBounds(el: HTMLElement): BoundingRect {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
    };
  }

  private extractAttributes(el: HTMLElement): Record<string, string> {
    const attrs: Record<string, string> = {};
    const skipAttrs = new Set(['class', 'style', 'data-hh-id']);
    for (const attr of el.attributes) {
      if (!skipAttrs.has(attr.name)) {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  private isVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private isDisabled(el: HTMLElement): boolean {
    return (
      el.hasAttribute('disabled') ||
      el.getAttribute('aria-disabled') === 'true' ||
      (el instanceof HTMLInputElement && el.disabled) ||
      (el instanceof HTMLButtonElement && el.disabled) ||
      (el instanceof HTMLSelectElement && el.disabled) ||
      (el instanceof HTMLTextAreaElement && el.disabled)
    );
  }

  private getDepth(el: HTMLElement): number {
    let depth = 0;
    let current: HTMLElement | null = el.parentElement;
    while (current && depth < 50) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  private generateStableId(role: string, selector: string, counter: Map<string, number>): string {
    const key = `${role}_${selector.slice(0, 20)}`;
    const count = (counter.get(key) ?? 0) + 1;
    counter.set(key, count);
    const suffix = count > 1 ? `_${count}` : '';
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    return `${role}_${Math.abs(hash).toString(36)}${suffix}`;
  }

  private isUnstableId(id: string): boolean {
    return /^(react-|ember|ng-|el-|_|\d)/.test(id) || /\d{4,}/.test(id);
  }

  private isDynamicClass(cls: string): boolean {
    return /[_-][a-z0-9]{5,}$/.test(cls) || /^\w+-\w+-\w+$/.test(cls);
  }
}
