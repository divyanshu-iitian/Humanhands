import type { Page } from 'playwright';
import type { ActionRequest, ActionResult } from '@humanhands/shared-types';

export interface ActionContext {
  page: Page;
  request: ActionRequest;
  resolvedSelector: string;
}

export interface IAction {
  readonly type: string;
  execute(context: ActionContext): Promise<Partial<ActionResult>>;
  validate(request: ActionRequest): string | null;
}
