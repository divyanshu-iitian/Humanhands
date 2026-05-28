import type { AccessibilityMetadata } from '@humanhands/shared-types';

export function extractAccessibilityMetadata(element: Element): AccessibilityMetadata {
  const ariaExpanded = element.getAttribute('aria-expanded');
  const ariaSelected = element.getAttribute('aria-selected');
  const ariaChecked = element.getAttribute('aria-checked');
  const ariaDisabled = element.getAttribute('aria-disabled');
  const ariaRequired = element.getAttribute('aria-required');
  const ariaHidden = element.getAttribute('aria-hidden');
  const ariaLive = element.getAttribute('aria-live');
  const tabIndex = element.getAttribute('tabindex');
  const tagName = element.tagName.toLowerCase();

  const nativelyFocusable = ['a', 'button', 'input', 'select', 'textarea'].includes(tagName);
  const tabIndexNum = tabIndex !== null ? parseInt(tabIndex, 10) : undefined;
  const focusable =
    nativelyFocusable ||
    tabIndexNum !== undefined
      ? (tabIndexNum ?? 0) >= 0
      : false;

  return {
    ariaRole: element.getAttribute('role') ?? undefined,
    ariaLabel:
      element.getAttribute('aria-label') ??
      element.getAttribute('aria-labelledby')
        ? resolveAriaLabelledBy(element)
        : undefined,
    ariaDescription:
      element.getAttribute('aria-describedby')
        ? resolveAriaDescribedBy(element)
        : undefined,
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
    focusable: !!focusable,
    keyboardAccessible: nativelyFocusable || (tabIndexNum !== undefined && tabIndexNum >= 0),
  };
}

function resolveAriaLabelledBy(element: Element): string | undefined {
  const ids = element.getAttribute('aria-labelledby');
  if (!ids) return element.getAttribute('aria-label') ?? undefined;

  const texts = ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim())
    .filter(Boolean);

  return texts.length > 0 ? texts.join(' ') : (element.getAttribute('aria-label') ?? undefined);
}

function resolveAriaDescribedBy(element: Element): string | undefined {
  const ids = element.getAttribute('aria-describedby');
  if (!ids) return undefined;

  const texts = ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim())
    .filter(Boolean);

  return texts.length > 0 ? texts.join(' ') : undefined;
}
