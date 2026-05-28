import type { ActionContext, IAction } from './types.js';
import type { ActionRequest, ActionResult } from '@humanhands/shared-types';

export class ClickAction implements IAction {
  readonly type = 'click';

  validate(request: ActionRequest): string | null {
    if (!request.target) return 'click action requires a target';
    return null;
  }

  async execute(context: ActionContext): Promise<Partial<ActionResult>> {
    const { page, request, resolvedSelector } = context;
    const timeout = request.options?.timeout ?? 10000;

    if (request.options?.scrollIntoView !== false) {
      await page.locator(resolvedSelector).scrollIntoViewIfNeeded({ timeout });
    }

    await page.locator(resolvedSelector).click({
      timeout,
      force: request.options?.force ?? false,
    });

    if (request.options?.waitForNavigation) {
      await page.waitForLoadState('networkidle', { timeout });
    }

    return { success: true };
  }
}
