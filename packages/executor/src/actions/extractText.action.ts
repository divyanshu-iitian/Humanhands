import type { ActionContext, IAction } from './types.js';
import type { ActionRequest, ActionResult } from '@humanhands/shared-types';

export class ExtractTextAction implements IAction {
  readonly type = 'extractText';

  validate(request: ActionRequest): string | null {
    if (!request.target) return 'extractText action requires a target';
    return null;
  }

  async execute(context: ActionContext): Promise<Partial<ActionResult>> {
    const { page, request, resolvedSelector } = context;
    const timeout = request.options?.timeout ?? 10000;
    const locator = page.locator(resolvedSelector);

    await locator.waitFor({ state: 'visible', timeout });

    const extractedText = await locator.innerText({ timeout });

    return {
      success: true,
      extractedText: extractedText.trim(),
      data: { text: extractedText.trim() },
    };
  }
}
