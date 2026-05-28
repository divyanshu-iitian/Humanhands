import type { ActionContext, IAction } from './types.js';
import type { ActionRequest, ActionResult } from '@humanhands/shared-types';

export class NavigateAction implements IAction {
  readonly type = 'navigate';

  validate(request: ActionRequest): string | null {
    if (!request.url) return 'navigate action requires a url';
    try {
      new URL(request.url);
      return null;
    } catch {
      return `navigate action received an invalid url: ${request.url}`;
    }
  }

  async execute(context: ActionContext): Promise<Partial<ActionResult>> {
    const { page, request } = context;
    const timeout = request.options?.timeout ?? 30000;

    const response = await page.goto(request.url!, {
      timeout,
      waitUntil: 'domcontentloaded',
    });

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // networkidle may not be reached on SPAs — fall through
    });

    return {
      success: (response?.status() ?? 200) < 400,
      navigatedUrl: page.url(),
    };
  }
}
