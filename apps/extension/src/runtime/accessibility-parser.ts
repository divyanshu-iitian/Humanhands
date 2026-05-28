import type { AccessibilityMetadata } from '@humanhands/shared-types';

export interface LandmarkRegion {
  role: string;
  label: string | undefined;
  element: Element;
}

export interface FormFieldGroup {
  label: string;
  element: HTMLElement;
  type: string;
}

export class AccessibilityParser {
  parseElement(element: Element): AccessibilityMetadata {
    const tag = element.tagName.toLowerCase();
    const ariaRole = element.getAttribute('role') ?? undefined;
    const ariaExpanded = element.getAttribute('aria-expanded');
    const ariaSelected = element.getAttribute('aria-selected');
    const ariaChecked = element.getAttribute('aria-checked');
    const ariaDisabled = element.getAttribute('aria-disabled');
    const ariaRequired = element.getAttribute('aria-required');
    const ariaHidden = element.getAttribute('aria-hidden');
    const ariaLive = element.getAttribute('aria-live');
    const tabIndex = element.getAttribute('tabindex');
    const tabIndexNum = tabIndex !== null ? parseInt(tabIndex, 10) : undefined;

    const nativelyFocusable =
      ['a', 'button', 'input', 'select', 'textarea', 'summary', 'details'].includes(tag) ||
      element.hasAttribute('contenteditable');

    return {
      ariaRole,
      ariaLabel: this.resolveLabel(element),
      ariaDescription: this.resolveDescription(element),
      ariaExpanded: ariaExpanded !== null ? ariaExpanded === 'true' : undefined,
      ariaSelected: ariaSelected !== null ? ariaSelected === 'true' : undefined,
      ariaChecked:
        ariaChecked === 'mixed'
          ? 'mixed'
          : ariaChecked !== null
            ? ariaChecked === 'true'
            : undefined,
      ariaDisabled: ariaDisabled !== null ? ariaDisabled === 'true' : undefined,
      ariaRequired: ariaRequired !== null ? ariaRequired === 'true' : undefined,
      ariaHidden: ariaHidden !== null ? ariaHidden === 'true' : undefined,
      ariaLive:
        ariaLive === 'polite' || ariaLive === 'assertive' || ariaLive === 'off'
          ? ariaLive
          : undefined,
      tabIndex: tabIndexNum,
      focusable: nativelyFocusable || (tabIndexNum !== undefined && tabIndexNum >= 0),
      keyboardAccessible:
        nativelyFocusable || (tabIndexNum !== undefined && tabIndexNum >= 0),
    };
  }

  detectLandmarks(): LandmarkRegion[] {
    const landmarkSelectors = [
      'main, [role="main"]',
      'nav, [role="navigation"]',
      'aside, [role="complementary"]',
      'header, [role="banner"]',
      'footer, [role="contentinfo"]',
      'form, [role="form"]',
      '[role="search"]',
      '[role="dialog"]',
      '[role="alertdialog"]',
    ];

    const regions: LandmarkRegion[] = [];

    for (const selector of landmarkSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const role =
          el.getAttribute('role') ?? el.tagName.toLowerCase();
        const label =
          el.getAttribute('aria-label') ??
          el.getAttribute('aria-labelledby')
            ? this.resolveIdRef(el.getAttribute('aria-labelledby'))
            : undefined;
        regions.push({ role, label, element: el });
      }
    }

    return regions;
  }

  computeTabOrder(): Element[] {
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
      'details > summary',
    ].join(', ');

    const elements = Array.from(document.querySelectorAll<HTMLElement>(focusableSelector));

    return elements
      .filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .sort((a, b) => {
        const ta = parseInt(a.getAttribute('tabindex') ?? '0', 10);
        const tb = parseInt(b.getAttribute('tabindex') ?? '0', 10);
        if (ta === tb) return 0;
        if (ta === 0) return 1;
        if (tb === 0) return -1;
        return ta - tb;
      });
  }

  resolveFormFieldLabel(input: HTMLElement): string {
    // 1. aria-label
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 2. aria-labelledby
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const resolved = this.resolveIdRef(ariaLabelledBy);
      if (resolved) return resolved;
    }

    // 3. <label for="...">
    const id = input.getAttribute('id');
    if (id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
      if (label) return label.textContent?.trim() ?? '';
    }

    // 4. Wrapping <label>
    const closestLabel = input.closest('label');
    if (closestLabel) {
      const clone = closestLabel.cloneNode(true) as HTMLElement;
      const inputClone = clone.querySelector('input, select, textarea');
      inputClone?.remove();
      return clone.textContent?.trim() ?? '';
    }

    // 5. placeholder
    const placeholder =
      (input as HTMLInputElement).placeholder ??
      input.getAttribute('placeholder');
    if (placeholder) return placeholder;

    // 6. title
    return input.getAttribute('title') ?? '';
  }

  detectFormGroups(form: HTMLElement): FormFieldGroup[] {
    const fields = form.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]), select, textarea',
    );
    return Array.from(fields).map((el) => ({
      label: this.resolveFormFieldLabel(el),
      element: el,
      type:
        el instanceof HTMLInputElement
          ? el.type
          : el.tagName.toLowerCase(),
    }));
  }

  private resolveLabel(element: Element): string | undefined {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const resolved = this.resolveIdRef(labelledBy);
      if (resolved) return resolved;
    }

    const id = element.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return label.textContent?.trim();
    }

    return undefined;
  }

  private resolveDescription(element: Element): string | undefined {
    const describedBy = element.getAttribute('aria-describedby');
    if (!describedBy) return undefined;
    return this.resolveIdRef(describedBy);
  }

  private resolveIdRef(idList: string | null): string | undefined {
    if (!idList) return undefined;
    const texts = idList
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    return texts.length > 0 ? texts.join(' ') : undefined;
  }
}
