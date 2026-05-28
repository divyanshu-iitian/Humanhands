import type { ActionContext, IAction } from './types.js';
import type { ActionRequest, ActionResult } from '@humanhands/shared-types';

export class SelectAction implements IAction {
  readonly type = 'select';

  validate(request: ActionRequest): string | null {
    if (!request.target) return 'select action requires a target';
    if (!request.value) return 'select action requires a value';
    return null;
  }

  async execute(context: ActionContext): Promise<Partial<ActionResult>> {
    const { page, request, resolvedSelector } = context;
    const timeout = request.options?.timeout ?? 10000;

    await page.locator(resolvedSelector).selectOption(request.value ?? '', { timeout });

    return { success: true };
  }
}
