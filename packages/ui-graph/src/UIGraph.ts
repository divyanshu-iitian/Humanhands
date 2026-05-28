import type { UIGraph as UIGraphData, UIElement, UIElementRole } from '@humanhands/shared-types';

/**
 * Immutable, traversable representation of a page's semantic UI structure.
 *
 * All mutation produces a new UIGraph — snapshots are safe to cache and compare.
 */
export class UIGraph {
  private readonly data: UIGraphData;

  constructor(data: UIGraphData) {
    this.data = Object.freeze({ ...data });
  }

  get pageId(): string {
    return this.data.pageId;
  }

  get sessionId(): string {
    return this.data.sessionId;
  }

  get url(): string {
    return this.data.url;
  }

  get checksum(): string {
    return this.data.checksum;
  }

  get timestamp(): number {
    return this.data.timestamp;
  }

  get version(): string {
    return this.data.version;
  }

  get elementCount(): number {
    return this.data.elements.length;
  }

  get interactableCount(): number {
    return this.data.interactableIds.length;
  }

  toJSON(): UIGraphData {
    return { ...this.data };
  }

  getElementById(id: string): UIElement | undefined {
    return this.data.elementMap[id];
  }

  getElementsByRole(role: UIElementRole): UIElement[] {
    return this.data.elements.filter((el) => el.role === role);
  }

  getInteractableElements(): UIElement[] {
    return this.data.interactableIds
      .map((id) => this.data.elementMap[id])
      .filter((el): el is UIElement => el !== undefined);
  }

  getFormsWithFields(): Array<{ form: UIElement; fields: UIElement[] }> {
    return this.data.formIds
      .map((formId) => {
        const form = this.data.elementMap[formId];
        if (!form) return null;
        const fields = this.getDescendants(formId).filter((el) =>
          ['input', 'textarea', 'select', 'checkbox', 'radio'].includes(el.role),
        );
        return { form, fields };
      })
      .filter((item): item is { form: UIElement; fields: UIElement[] } => item !== null);
  }

  getChildren(elementId: string): UIElement[] {
    const element = this.data.elementMap[elementId];
    if (!element) return [];
    return element.childIds
      .map((id) => this.data.elementMap[id])
      .filter((el): el is UIElement => el !== undefined);
  }

  getParent(elementId: string): UIElement | undefined {
    const element = this.data.elementMap[elementId];
    if (!element?.parentId) return undefined;
    return this.data.elementMap[element.parentId];
  }

  getDescendants(elementId: string): UIElement[] {
    const result: UIElement[] = [];
    const queue = [elementId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const children = this.getChildren(current);
      result.push(...children);
      queue.push(...children.map((c) => c.id));
    }

    return result;
  }

  findByText(text: string, exact = false): UIElement[] {
    const needle = text.toLowerCase();
    return this.data.elements.filter((el) => {
      const haystack = el.text.toLowerCase();
      return exact ? haystack === needle : haystack.includes(needle);
    });
  }

  findByAriaLabel(label: string): UIElement[] {
    return this.data.elements.filter(
      (el) => el.accessibility.ariaLabel?.toLowerCase() === label.toLowerCase(),
    );
  }

  hasChanged(other: UIGraph): boolean {
    return this.checksum !== other.checksum;
  }

  diff(other: UIGraph): { added: UIElement[]; removed: UIElement[]; modified: UIElement[] } {
    const thisMap = this.data.elementMap;
    const otherMap = other.toJSON().elementMap;

    const added = other
      .toJSON()
      .elements.filter((el) => !thisMap[el.id]);
    const removed = this.data.elements.filter((el) => !otherMap[el.id]);
    const modified = this.data.elements.filter((el) => {
      const otherEl = otherMap[el.id];
      if (!otherEl) return false;
      return el.text !== otherEl.text || el.enabled !== otherEl.enabled || el.visible !== otherEl.visible;
    });

    return { added, removed, modified };
  }
}
