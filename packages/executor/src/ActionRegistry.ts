import type { ActionType } from '@humanhands/shared-types';
import type { IAction } from './actions/types.js';
import {
  ClickAction,
  TypeAction,
  SelectAction,
  NavigateAction,
  WaitForAction,
  ExtractTextAction,
} from './actions/index.js';

export class ActionRegistry {
  private readonly registry = new Map<ActionType, IAction>();

  constructor() {
    this.register(new ClickAction());
    this.register(new TypeAction());
    this.register(new SelectAction());
    this.register(new NavigateAction());
    this.register(new WaitForAction());
    this.register(new ExtractTextAction());
  }

  register(action: IAction): void {
    this.registry.set(action.type as ActionType, action);
  }

  get(type: ActionType): IAction | undefined {
    return this.registry.get(type);
  }

  has(type: ActionType): boolean {
    return this.registry.has(type);
  }

  listRegistered(): ActionType[] {
    return Array.from(this.registry.keys());
  }
}
