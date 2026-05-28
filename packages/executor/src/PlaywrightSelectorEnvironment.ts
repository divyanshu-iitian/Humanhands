import type { Page } from 'playwright';
import type { ISelectorEnvironment } from '@humanhands/selector-engine';

export class PlaywrightSelectorEnvironment implements ISelectorEnvironment {
  constructor(private readonly page: Page) {}

  queryCount(selector: string): number {
    // This is evaluated synchronously via a cached async snapshot.
    // For the environment adapter, callers should use queryCountAsync.
    throw new Error('Use queryCountAsync in Playwright context');
  }

  queryXPathCount(xpath: string): number {
    throw new Error('Use queryXPathCountAsync in Playwright context');
  }

  async queryCountAsync(selector: string): Promise<number> {
    try {
      const count = await this.page.locator(selector).count();
      return count;
    } catch {
      return 0;
    }
  }

  async queryXPathCountAsync(xpath: string): Promise<number> {
    try {
      const count = await this.page.locator(`xpath=${xpath}`).count();
      return count;
    } catch {
      return 0;
    }
  }

  async resolveFirstMatchingSelector(
    selectors: string[],
  ): Promise<{ selector: string; index: number } | null> {
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      if (!selector) continue;
      try {
        const count = await this.page.locator(selector).count();
        if (count === 1) return { selector, index: i };
      } catch {
        continue;
      }
    }
    return null;
  }
}
