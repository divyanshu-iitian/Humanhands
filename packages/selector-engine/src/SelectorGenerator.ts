import type { SelectorMetadata } from '@humanhands/shared-types';
import type { SelectorCandidate, GeneratedSelector, ElementFingerprint } from './types.js';

/**
 * Node.js-compatible CSS identifier escaping (mirrors CSS.escape spec).
 * The browser's CSS.escape is not available in Node.js environments.
 */
function cssEscape(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) { result += '�'; continue; }
    if ((code >= 0x0001 && code <= 0x001f) || code === 0x007f) {
      result += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 0 && code >= 0x0030 && code <= 0x0039) {
      result += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 1 && code >= 0x0030 && code <= 0x0039 && value.charCodeAt(0) === 0x002d) {
      result += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 0 && value.length === 1 && code === 0x002d) { result += `\\${value[i]}`; continue; }
    if (code >= 0x0080 || code === 0x002d || code === 0x005f || (code >= 0x0030 && code <= 0x0039) ||
        (code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) {
      result += value[i];
    } else {
      result += `\\${value[i]}`;
    }
  }
  return result;
}

/**
 * Generates multi-strategy selectors for DOM elements.
 *
 * Priority order (highest confidence first):
 * 1. data-testid / data-cy / data-qa
 * 2. unique id
 * 3. aria-label + role
 * 4. name attribute
 * 5. combined stable CSS
 * 6. XPath structural
 */
export class SelectorGenerator {
  generateFromFingerprint(fingerprint: ElementFingerprint): GeneratedSelector {
    const candidates: SelectorCandidate[] = [];

    const testIdSelector = this.tryTestIdSelector(fingerprint);
    if (testIdSelector) candidates.push(testIdSelector);

    const idSelector = this.tryIdSelector(fingerprint);
    if (idSelector) candidates.push(idSelector);

    const ariaSelector = this.tryAriaSelector(fingerprint);
    if (ariaSelector) candidates.push(ariaSelector);

    const nameSelector = this.tryNameSelector(fingerprint);
    if (nameSelector) candidates.push(nameSelector);

    const cssSelector = this.buildCssSelector(fingerprint);
    candidates.push(cssSelector);

    const xpathSelector = this.buildXPathSelector(fingerprint);
    candidates.push(xpathSelector);

    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const primary = sorted[0]?.selector ?? cssSelector.selector;
    const fallbacks = sorted.slice(1).map((c) => c.selector);

    return {
      primary,
      fallbacks,
      xpath: xpathSelector.selector,
      semantic: ariaSelector?.selector,
      dataTestId: testIdSelector?.selector,
      candidates: sorted,
      generatedAt: Date.now(),
    };
  }

  toSelectorMetadata(generated: GeneratedSelector): SelectorMetadata {
    return {
      primary: generated.primary,
      fallbacks: generated.fallbacks,
      xpath: generated.xpath,
      semantic: generated.semantic,
      dataTestId: generated.dataTestId,
    };
  }

  private tryTestIdSelector(fp: ElementFingerprint): SelectorCandidate | null {
    if (!fp.dataTestId) return null;
    return {
      selector: `[data-testid="${cssEscape(fp.dataTestId)}"]`,
      strategy: 'data-testid',
      confidence: 0.98,
      stable: true,
    };
  }

  private tryIdSelector(fp: ElementFingerprint): SelectorCandidate | null {
    if (!fp.id || this.isUnstableId(fp.id)) return null;
    return {
      selector: `#${cssEscape(fp.id)}`,
      strategy: 'id',
      confidence: 0.95,
      stable: true,
    };
  }

  private tryAriaSelector(fp: ElementFingerprint): SelectorCandidate | null {
    if (!fp.ariaLabel) return null;
    const base = fp.ariaRole
      ? `[role="${fp.ariaRole}"][aria-label="${fp.ariaLabel}"]`
      : `[aria-label="${fp.ariaLabel}"]`;
    return {
      selector: base,
      strategy: 'aria-label',
      confidence: 0.88,
      stable: true,
    };
  }

  private tryNameSelector(fp: ElementFingerprint): SelectorCandidate | null {
    if (!fp.name) return null;
    return {
      selector: `${fp.tagName}[name="${fp.name}"]`,
      strategy: 'name',
      confidence: 0.82,
      stable: true,
    };
  }

  private buildCssSelector(fp: ElementFingerprint): SelectorCandidate {
    const parts: string[] = [fp.tagName.toLowerCase()];

    const stableClasses = fp.classes.filter((c) => !this.isDynamicClass(c));
    if (stableClasses.length > 0) {
      parts.push(stableClasses.slice(0, 3).map((c) => `.${cssEscape(c)}`).join(''));
    }

    if (fp.type) {
      parts.push(`[type="${fp.type}"]`);
    }

    return {
      selector: parts.join(''),
      strategy: fp.classes.length > 0 ? 'css-class' : 'css-structural',
      confidence: 0.65,
      stable: stableClasses.length > 0,
    };
  }

  private buildXPathSelector(fp: ElementFingerprint): SelectorCandidate {
    const tag = fp.tagName.toLowerCase();
    const index = fp.childIndex + 1;

    let xpath = `//${tag}`;
    if (fp.ariaLabel) {
      xpath = `//${tag}[@aria-label="${fp.ariaLabel}"]`;
    } else if (fp.textContent && fp.textContent.length < 60) {
      xpath = `//${tag}[normalize-space(.)="${fp.textContent}"]`;
    } else {
      xpath = `(//${tag})[${index}]`;
    }

    return {
      selector: xpath,
      strategy: 'xpath',
      confidence: 0.55,
      stable: !!(fp.ariaLabel ?? fp.textContent),
    };
  }

  private isUnstableId(id: string): boolean {
    // IDs with numbers that look auto-generated (e.g., "el-123456", "react-aria-1")
    return /^(react-|ember|ng-|el-|_|\d)/.test(id) || /\d{4,}/.test(id);
  }

  private isDynamicClass(cls: string): boolean {
    // Tailwind-style computed classes, CSS modules hashes, etc.
    return /[_-][a-z0-9]{5,}$/.test(cls) || /^\w+-\w+-\w+$/.test(cls);
  }
}
