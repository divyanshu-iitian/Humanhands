import type { ActionContext, IAction } from './types.js';
import type { ActionRequest, ActionResult } from '@humanhands/shared-types';

export class WaitForAction implements IAction {
  readonly type = 'waitFor';

  validate(request: ActionRequest): string | null {
    if (!request.target && !request.value) {
      return 'waitFor action requires either a target selector or a value (load state)';
    }
    return null;
  }

  async execute(context: ActionContext): Promise<Partial<ActionResult>> {
    const { page, request, resolvedSelector } = context;
    const timeout = request.options?.timeout ?? 10000;

    if (request.target) {
      await page.locator(resolvedSelector).waitFor({ state: 'visible', timeout });
    } else if (request.value) {
      const validStates = ['load', 'domcontentloaded', 'networkidle'] as const;
      const state = validStates.includes(request.value as (typeof validStates)[number])
        ? (request.value as (typeof validStates)[number])
        : 'load';
      await page.waitForLoadState(state, { timeout });
    }

    return { success: true };
  }
}
