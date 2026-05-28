import type { UIElement, UIElementRole } from '@humanhands/shared-types';

const TAG_TO_ROLE_MAP: Record<string, UIElementRole> = {
  button: 'button',
  a: 'link',
  input: 'input',
  textarea: 'textarea',
  select: 'select',
  option: 'option',
  form: 'form',
  table: 'table',
  tr: 'table-row',
  td: 'table-cell',
  th: 'table-header',
  nav: 'nav',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  ul: 'list',
  ol: 'list',
  li: 'list-item',
  img: 'image',
  dialog: 'dialog',
  menu: 'menu',
};

const ARIA_ROLE_MAP: Record<string, UIElementRole> = {
  button: 'button',
  link: 'link',
  textbox: 'input',
  combobox: 'select',
  listbox: 'select',
  option: 'option',
  checkbox: 'checkbox',
  radio: 'radio',
  tab: 'tab',
  tabpanel: 'tab-panel',
  menuitem: 'menu-item',
  dialog: 'dialog',
  alert: 'alert',
  tooltip: 'tooltip',
  navigation: 'nav',
  heading: 'heading',
  list: 'list',
  listitem: 'list-item',
  img: 'image',
  modal: 'modal',
};

export function resolveRole(
  tagName: string,
  ariaRole: string | undefined,
  inputType: string | undefined,
): UIElementRole {
  if (ariaRole) {
    const mapped = ARIA_ROLE_MAP[ariaRole.toLowerCase()];
    if (mapped) return mapped;
  }

  if (tagName === 'input') {
    if (inputType === 'checkbox') return 'checkbox';
    if (inputType === 'radio') return 'radio';
    if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') return 'button';
    return 'input';
  }

  return TAG_TO_ROLE_MAP[tagName.toLowerCase()] ?? 'generic';
}

export function isInteractable(element: Pick<UIElement, 'role' | 'enabled' | 'visible'>): boolean {
  const interactableRoles: UIElementRole[] = [
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
  return element.visible && element.enabled && interactableRoles.includes(element.role);
}

export function generateStableId(
  tagName: string,
  role: UIElementRole,
  text: string,
  selector: string,
  depth: number,
  childIndex: number,
): string {
  const normalized = [tagName, role, text.slice(0, 20), selector.slice(0, 30), depth, childIndex]
    .join('|')
    .replace(/\s+/g, '_')
    .toLowerCase();

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `${role}_${Math.abs(hash).toString(36)}`;
}
