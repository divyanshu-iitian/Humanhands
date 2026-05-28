import type { ActionContext, IAction } from './types.js';
import type { ActionRequest, ActionResult } from '@humanhands/shared-types';

export class TypeAction implements IAction {
  readonly type = 'type';

  validate(request: ActionRequest): string | null {
    if (!request.target) return 'type action requires a target';
    if (request.value === undefined) return 'type action requires a value';
    return null;
  }

  async execute(context: ActionContext): Promise<Partial<ActionResult>> {
    const { page, request, resolvedSelector } = context;
    const timeout = request.options?.timeout ?? 10000;
    const locator = page.locator(resolvedSelector);

    await locator.waitFor({ state: 'visible', timeout });

    if (request.options?.clearBeforeType) {
      await locator.clear({ timeout });
    }

    await locator.fill(request.value ?? '', { timeout });

    if (request.options?.pressEnterAfterType) {
      await locator.press('Enter', { timeout });
    }

    return { success: true };
  }
}
