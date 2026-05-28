import type { SelectorMetadata } from '@humanhands/shared-types';
import type { SelectorValidationResult, SelectorCandidate } from './types.js';

export interface SelectorResolutionResult {
  resolved: boolean;
  selectorUsed: string;
  strategy: string;
  attemptCount: number;
  error?: string;
}

/**
 * Validates and resolves selectors through a prioritized fallback chain.
 *
 * This engine is intentionally headless-environment agnostic — concrete
 * environment adapters (Playwright, extension content-script) implement
 * ISelectorEnvironment and inject it at construction time.
 */
export interface ISelectorEnvironment {
  queryCount(selector: string): number;
  queryXPathCount(xpath: string): number;
}

export class SelectorEngine {
  constructor(private readonly env: ISelectorEnvironment) {}

  /**
   * Resolves the first selector from the metadata chain that uniquely
   * matches an element in the current environment.
   */
  resolve(metadata: SelectorMetadata): SelectorResolutionResult {
    const chain = this.buildChain(metadata);

    for (let i = 0; i < chain.length; i++) {
      const candidate = chain[i];
      if (!candidate) continue;

      const validation = this.validate(candidate.selector, candidate.strategy === 'xpath');

      if (validation.valid && validation.uniqueMatch) {
        return {
          resolved: true,
          selectorUsed: candidate.selector,
          strategy: candidate.strategy,
          attemptCount: i + 1,
        };
      }
    }

    return {
      resolved: false,
      selectorUsed: metadata.primary,
      strategy: 'primary-failed',
      attemptCount: chain.length,
      error: `No selector in chain matched uniquely. Chain: [${chain.map((c) => c.selector).join(', ')}]`,
    };
  }

  validate(selector: string, isXPath = false): SelectorValidationResult {
    try {
      const count = isXPath ? this.env.queryXPathCount(selector) : this.env.queryCount(selector);
      return {
        selector,
        valid: count > 0,
        matchCount: count,
        uniqueMatch: count === 1,
      };
    } catch (error) {
      return {
        selector,
        valid: false,
        matchCount: 0,
        uniqueMatch: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildChain(metadata: SelectorMetadata): SelectorCandidate[] {
    const chain: SelectorCandidate[] = [];

    if (metadata.dataTestId) {
      chain.push({ selector: metadata.dataTestId, strategy: 'data-testid', confidence: 0.98, stable: true });
    }
    chain.push({ selector: metadata.primary, strategy: 'combined', confidence: 0.9, stable: true });
    if (metadata.semantic) {
      chain.push({ selector: metadata.semantic, strategy: 'aria-label', confidence: 0.85, stable: true });
    }
    for (const fb of metadata.fallbacks) {
      chain.push({ selector: fb, strategy: 'css-structural', confidence: 0.6, stable: false });
    }
    if (metadata.xpath) {
      chain.push({ selector: metadata.xpath, strategy: 'xpath', confidence: 0.5, stable: false });
    }

    return chain;
  }
}
