import type {
  UIElement,
  UIElementRole,
  BoundingRect,
  SelectorMetadata,
} from '@humanhands/shared-types';
import { AccessibilityParser } from './accessibility-parser.js';

export interface ElementRegistryEntry {
  element: UIElement;
  domNode: Element;
}

export interface IncrementalResult {
  elements: UIElement[];
  added: UIElement[];
  removed: UIElement[];
  modified: UIElement[];
  registry: Map<string, ElementRegistryEntry>;
}

const EXTRACTABLE = [
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
  '[role="option"]',
  '[role="tab"]',
  '[role="tabpanel"]',
  '[role="menuitem"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[contenteditable="true"]',
  'form',
  'nav',
  'h1',
  'h2',
  'h3',
  '[aria-label]',
  '[data-testid]',
  'table',
  '[role="grid"]',
  '[role="table"]',
].join(', ');

const INTERACTABLE_ROLES: UIElementRole[] = [
  'button',
  'input',
  'textarea',
  'select',
  'link',
  'checkbox',
  'radio',
  'tab',
  'menu-item',
];

export class IncrementalDomExtractor {
  private readonly registry = new Map<string, ElementRegistryEntry>();
  private readonly accessibilityParser = new AccessibilityParser();
  private readonly idCounters = new Map<string, number>();
  private sessionId: string;
  private pageId: string;

  constructor(sessionId: string, pageId: string) {
    this.sessionId = sessionId;
    this.pageId = pageId;
  }

  updateContext(sessionId: string, pageId: string): void {
    this.sessionId = sessionId;
    this.pageId = pageId;
  }

  /**
   * Full DOM scan — use only on initial load or after route change.
   * Replaces the entire registry.
   */
  fullExtract(): IncrementalResult {
    // Clear registry and ID counters
    this.registry.clear();
    this.idCounters.clear();
    // Remove all existing data-hh-id stamps to start fresh
    document.querySelectorAll('[data-hh-id]').forEach((el) => el.removeAttribute('data-hh-id'));

    const rawEls = document.querySelectorAll<HTMLElement>(EXTRACTABLE);
    const extracted: UIElement[] = [];
    const seen = new WeakSet<HTMLElement>();

    for (const el of rawEls) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!this.isVisible(el)) continue;

      const uiEl = this.extractElement(el);
      if (uiEl) {
        extracted.push(uiEl);
        this.registry.set(uiEl.id, { element: uiEl, domNode: el });
      }
    }

    this.wireRelationships(extracted);

    return {
      elements: extracted,
      added: extracted,
      removed: [],
      modified: [],
      registry: this.registry,
    };
  }

  /**
   * Incremental update triggered by a mutation batch.
   * Only re-scans affected subtrees and removes stale entries.
   */
  incrementalUpdate(
    addedSubtrees: Element[],
    removedHhIds: string[],
    modifiedHhIds: string[],
  ): IncrementalResult {
    const added: UIElement[] = [];
    const removed: UIElement[] = [];
    const modified: UIElement[] = [];

    // ── 1. Remove stale entries ───────────────────────────────────────────
    for (const hhId of removedHhIds) {
      const entry = this.registry.get(hhId);
      if (entry) {
        removed.push(entry.element);
        this.registry.delete(hhId);
      }
    }

    // ── 2. Update modified attribute-changed elements ─────────────────────
    for (const hhId of modifiedHhIds) {
      const entry = this.registry.get(hhId);
      if (!entry) continue;
      const domNode = entry.domNode instanceof HTMLElement ? entry.domNode : null;
      if (!domNode) continue;

      const updated = this.extractElement(domNode, hhId);
      if (updated) {
        const prev = entry.element;
        if (this.hasChanged(prev, updated)) {
          this.registry.set(hhId, { element: updated, domNode });
          modified.push(updated);
        }
      }
    }

    // ── 3. Scan added subtrees ────────────────────────────────────────────
    for (const subtreeRoot of addedSubtrees) {
      const candidates =
        subtreeRoot instanceof HTMLElement && subtreeRoot.matches(EXTRACTABLE)
          ? [subtreeRoot, ...subtreeRoot.querySelectorAll<HTMLElement>(EXTRACTABLE)]
          : Array.from(subtreeRoot.querySelectorAll<HTMLElement>(EXTRACTABLE));

      for (const el of candidates) {
        if (!(el instanceof HTMLElement)) continue;
        if (!this.isVisible(el)) continue;

        const existingId = el.getAttribute('data-hh-id');
        if (existingId && this.registry.has(existingId)) continue;

        const uiEl = this.extractElement(el);
        if (uiEl) {
          this.registry.set(uiEl.id, { element: uiEl, domNode: el });
          added.push(uiEl);
        }
      }
    }

    // ── 4. Re-wire relationships for all affected elements ─────────────────
    const allElements = Array.from(this.registry.values()).map((e) => e.element);
    // Only re-wire parents/children of changed elements
    const changedIds = new Set([
      ...added.map((e) => e.id),
      ...modified.map((e) => e.id),
      ...removed.map((e) => e.id),
    ]);
    if (changedIds.size > 0) {
      this.wireRelationships(allElements);
    }

    return {
      elements: allElements,
      added,
      removed,
      modified,
      registry: this.registry,
    };
  }

  getElements(): UIElement[] {
    return Array.from(this.registry.values()).map((e) => e.element);
  }

  getElementById(hhId: string): UIElement | undefined {
    return this.registry.get(hhId)?.element;
  }

  getDomNode(hhId: string): Element | undefined {
    return this.registry.get(hhId)?.domNode;
  }

  private extractElement(el: HTMLElement, forceId?: string): UIElement | null {
    const tag = el.tagName.toLowerCase();
    const inputType = el instanceof HTMLInputElement ? el.type : undefined;
    const ariaRole = el.getAttribute('role') ?? undefined;
    const role = this.resolveRole(tag, ariaRole, inputType);

    const selector = this.generateSelector(el);
    const hhId = forceId ?? this.generateHhId(role, selector.primary);
    el.setAttribute('data-hh-id', hhId);

    const text = this.extractText(el);
    const bounds = this.extractBounds(el);
    const accessibility = this.accessibilityParser.parseElement(el);
    const visible = this.isVisible(el);
    const enabled = !this.isDisabled(el);

    return {
      id: hhId,
      role,
      tagName: tag,
      text,
      placeholder:
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.placeholder || undefined
          : undefined,
      value:
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
          ? el.value || undefined
          : undefined,
      href: el instanceof HTMLAnchorElement ? el.href || undefined : undefined,
      inputType,
      selector,
      visible,
      enabled,
      interactable: visible && enabled && INTERACTABLE_ROLES.includes(role),
      bounds,
      accessibility,
      attributes: this.extractAttributes(el),
      parentId: null,
      childIds: [],
      depth: this.getDepth(el),
      pageId: this.pageId,
      extractedAt: Date.now(),
    };
  }

  private wireRelationships(elements: UIElement[]): void {
    // Reset all relationships
    for (const el of elements) {
      el.parentId = null;
      el.childIds = [];
    }

    const byHhId = new Map<string, UIElement>();
    for (const el of elements) byHhId.set(el.id, el);

    for (const el of elements) {
      const domNode = this.registry.get(el.id)?.domNode;
      if (!domNode) continue;

      let parentNode = domNode.parentElement;
      while (parentNode) {
        const parentHhId = parentNode.getAttribute('data-hh-id');
        if (parentHhId && byHhId.has(parentHhId)) {
          el.parentId = parentHhId;
          const parentEl = byHhId.get(parentHhId);
          if (parentEl && !parentEl.childIds.includes(el.id)) {
            parentEl.childIds.push(el.id);
          }
          break;
        }
        parentNode = parentNode.parentElement;
      }
    }
  }

  private resolveRole(tag: string, ariaRole?: string, inputType?: string): UIElementRole {
    const ariaRoleMap: Record<string, UIElementRole> = {
      button: 'button', link: 'link', checkbox: 'checkbox', radio: 'radio',
      tab: 'tab', tabpanel: 'tab-panel', menuitem: 'menu-item',
      dialog: 'dialog', alertdialog: 'dialog', textbox: 'input',
      combobox: 'select', listbox: 'select', option: 'option',
      navigation: 'nav', main: 'generic', search: 'generic',
      grid: 'table', table: 'table', row: 'table-row', cell: 'table-cell',
    };

    if (ariaRole && ariaRoleMap[ariaRole]) return ariaRoleMap[ariaRole]!;

    if (tag === 'input') {
      if (inputType === 'checkbox') return 'checkbox';
      if (inputType === 'radio') return 'radio';
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') return 'button';
      return 'input';
    }

    const tagMap: Record<string, UIElementRole> = {
      button: 'button', a: 'link', textarea: 'textarea', select: 'select',
      option: 'option', form: 'form', table: 'table', tr: 'table-row',
      td: 'table-cell', th: 'table-header', nav: 'nav', h1: 'heading',
      h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
      ul: 'list', ol: 'list', li: 'list-item', img: 'image', dialog: 'dialog',
    };

    return tagMap[tag] ?? 'generic';
  }

  private generateSelector(el: HTMLElement): SelectorMetadata {
    const fallbacks: string[] = [];

    const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-cy') ?? el.getAttribute('data-qa');
    if (testId) {
      return { primary: `[data-testid="${testId}"]`, fallbacks: [], dataTestId: `[data-testid="${testId}"]` };
    }

    if (el.id && !this.isUnstableId(el.id)) {
      const primary = `#${CSS.escape(el.id)}`;
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) fallbacks.push(`[aria-label="${ariaLabel}"]`);
      return { primary, fallbacks };
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const primary = `[aria-label="${ariaLabel}"]`;
      fallbacks.push(`${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`);
      return { primary, fallbacks, semantic: primary };
    }

    const name = el.getAttribute('name');
    if (name) {
      const primary = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
      return { primary, fallbacks };
    }

    return { primary: this.buildCssSelector(el), fallbacks };
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

    if (el instanceof HTMLInputElement) return (el.placeholder || el.value || '').trim();

    return (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
  }

  private extractBounds(el: HTMLElement): BoundingRect {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      width: Math.round(r.width), height: Math.round(r.height),
      top: Math.round(r.top), right: Math.round(r.right),
      bottom: Math.round(r.bottom), left: Math.round(r.left),
    };
  }

  private extractAttributes(el: HTMLElement): Record<string, string> {
    const result: Record<string, string> = {};
    const skip = new Set(['class', 'style', 'data-hh-id']);
    for (const attr of el.attributes) {
      if (!skip.has(attr.name)) result[attr.name] = attr.value;
    }
    return result;
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
    while (current && depth < 60) { depth++; current = current.parentElement; }
    return depth;
  }

  private generateHhId(role: string, selector: string): string {
    const key = `${role}_${selector.slice(0, 24)}`;
    const count = (this.idCounters.get(key) ?? 0) + 1;
    this.idCounters.set(key, count);
    let hash = 0;
    for (let i = 0; i < key.length; i++) { hash = (hash << 5) - hash + key.charCodeAt(i); hash |= 0; }
    return `${role}_${Math.abs(hash).toString(36)}${count > 1 ? `_${count}` : ''}`;
  }

  private hasChanged(prev: UIElement, next: UIElement): boolean {
    return (
      prev.text !== next.text ||
      prev.enabled !== next.enabled ||
      prev.visible !== next.visible ||
      prev.value !== next.value ||
      JSON.stringify(prev.accessibility) !== JSON.stringify(next.accessibility)
    );
  }

  private isUnstableId(id: string): boolean {
    return /^(react-|ember|ng-|el-|_|\d)/.test(id) || /\d{4,}/.test(id);
  }

  private isDynamicClass(cls: string): boolean {
    return /[_-][a-z0-9]{5,}$/.test(cls) || /^\w{2,}-\w{2,}-\w{2,}$/.test(cls);
  }
}
