import type { RecordedAction } from '@humanhands/shared-types';

/**
 * Generates human-readable step names from raw recorded actions.
 * These names appear in the workflow definition and debugger UI.
 */
export class StepNamer {
  name(action: RecordedAction): string {
    const target = action.target;
    const elementText = (target?.text ?? '').slice(0, 40);
    const fieldLabel = target?.accessibility.ariaLabel ?? '';
    const role = target?.role ?? '';
    const label = fieldLabel || elementText;

    switch (action.actionType) {
      case 'click':
        if (role === 'button') return `Click "${label || 'button'}"`;
        if (role === 'link') return `Click link "${label || 'link'}"`;
        if (role === 'checkbox') return `Toggle checkbox "${label || 'checkbox'}"`;
        if (role === 'tab') return `Select tab "${label || 'tab'}"`;
        if (role === 'menu-item') return `Select menu item "${label || 'item'}"`;
        return `Click "${label || 'element'}"`;

      case 'type':
        return `Type in ${this.fieldDescription(action)} field`;

      case 'select':
        return `Select "${action.value ?? 'option'}" in ${this.fieldDescription(action)}`;

      case 'navigate': {
        try {
          const url = new URL(action.url ?? '');
          return `Navigate to ${url.pathname || url.host}`;
        } catch {
          return `Navigate to ${action.url ?? 'page'}`;
        }
      }

      case 'scroll': {
        if (target) return `Scroll to "${elementText || 'element'}"`;
        const direction = (action.value && parseInt(action.value) < 0) ? 'up' : 'down';
        return `Scroll ${direction}`;
      }

      case 'hover':
        return `Hover over "${label || 'element'}"`;

      case 'waitFor':
        return `Wait for "${elementText || 'element'}" to appear`;

      case 'extractText':
        return `Extract text from "${elementText || 'element'}"`;

      case 'submit':
        return `Submit form`;

      case 'upload':
        return `Upload file to "${fieldLabel || 'file input'}"`;

      default:
        return `${action.actionType} on "${label || 'element'}"`;
    }
  }

  describe(action: RecordedAction): string {
    const target = action.target;
    const elementInfo = target
      ? `${target.role} with selector "${target.selector.primary}"`
      : 'page';

    switch (action.actionType) {
      case 'type':
        return `Type "${action.value ?? ''}" into ${elementInfo}`;
      case 'click':
        return `Click ${elementInfo}`;
      case 'navigate':
        return `Navigate to ${action.url ?? 'URL'}`;
      default:
        return `${action.actionType} on ${elementInfo}`;
    }
  }

  private fieldDescription(action: RecordedAction): string {
    const target = action.target;
    const label = target?.accessibility.ariaLabel ?? target?.text ?? '';
    const fieldType = target?.inputType;

    if (label) return `"${label}"`;
    if (fieldType === 'email') return 'email';
    if (fieldType === 'password') return 'password';
    if (fieldType === 'tel') return 'phone';
    if (target?.role === 'textarea') return 'text area';
    if (target?.role === 'select') return 'dropdown';
    return 'input';
  }
}
