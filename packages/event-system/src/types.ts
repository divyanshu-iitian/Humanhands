import type { WorkflowEvent, EventType } from '@humanhands/shared-types';

export type EventPayloadMap = Record<string, unknown>;

export type EventHandler<T = unknown> = (
  event: WorkflowEvent & { payload: T },
) => void | Promise<void>;

export interface EventSubscription {
  readonly id: string;
  readonly eventType: EventType;
  readonly handler: EventHandler;
  readonly once: boolean;
  readonly registeredAt: number;
}

export interface EventBusConfig {
  maxListeners?: number;
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface EventBusStats {
  totalEmitted: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  subscriptionsByType: Partial<Record<EventType, number>>;
}

export interface IEventBus {
  emit(event: WorkflowEvent): void;
  on<T = unknown>(eventType: EventType, handler: EventHandler<T>): string;
  once<T = unknown>(eventType: EventType, handler: EventHandler<T>): string;
  off(subscriptionId: string): void;
  clear(eventType?: EventType): void;
  listenerCount(eventType: EventType): number;
  stats(): EventBusStats;
}
