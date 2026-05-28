import EventEmitter from 'eventemitter3';
import { randomUUID } from 'crypto';
import type { WorkflowEvent, EventType } from '@humanhands/shared-types';
import type {
  EventHandler,
  EventSubscription,
  EventBusConfig,
  EventBusStats,
  IEventBus,
} from './types.js';

export class EventBus implements IEventBus {
  private readonly emitter: EventEmitter;
  private readonly subscriptions = new Map<string, EventSubscription>();
  private readonly config: Required<EventBusConfig>;
  private sequenceCounter = 0;
  private totalEmitted = 0;

  constructor(config: EventBusConfig = {}) {
    this.config = {
      maxListeners: config.maxListeners ?? 200,
      enableLogging: config.enableLogging ?? false,
      logLevel: config.logLevel ?? 'info',
    };
    this.emitter = new EventEmitter();
    (this.emitter as unknown as { setMaxListeners: (n: number) => void }).setMaxListeners?.(
      this.config.maxListeners,
    );
  }

  emit(event: WorkflowEvent): void {
    this.totalEmitted++;
    if (this.config.enableLogging) {
      this.log(`emit [${event.type}] id=${event.id} seq=${event.sequenceNumber}`);
    }
    this.emitter.emit(event.type, event);
  }

  on<T = unknown>(eventType: EventType, handler: EventHandler<T>): string {
    const id = randomUUID();
    const wrappedHandler = handler as EventHandler;
    const subscription: EventSubscription = {
      id,
      eventType,
      handler: wrappedHandler,
      once: false,
      registeredAt: Date.now(),
    };
    this.subscriptions.set(id, subscription);
    this.emitter.on(eventType, wrappedHandler as unknown as (...args: unknown[]) => void);
    return id;
  }

  once<T = unknown>(eventType: EventType, handler: EventHandler<T>): string {
    const id = randomUUID();
    const wrappedHandler = handler as EventHandler;

    const onceWrapper = (event: WorkflowEvent) => {
      (wrappedHandler as unknown as (e: WorkflowEvent) => void)(event);
      this.subscriptions.delete(id);
    };

    const subscription: EventSubscription = {
      id,
      eventType,
      handler: wrappedHandler,
      once: true,
      registeredAt: Date.now(),
    };
    this.subscriptions.set(id, subscription);
    this.emitter.once(eventType, onceWrapper as unknown as (...args: unknown[]) => void);
    return id;
  }

  off(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    this.emitter.off(
      subscription.eventType,
      subscription.handler as unknown as (...args: unknown[]) => void,
    );
    this.subscriptions.delete(subscriptionId);
  }

  clear(eventType?: EventType): void {
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
      for (const [id, sub] of this.subscriptions) {
        if (sub.eventType === eventType) this.subscriptions.delete(id);
      }
    } else {
      this.emitter.removeAllListeners();
      this.subscriptions.clear();
    }
  }

  listenerCount(eventType: EventType): number {
    return this.emitter.listenerCount(eventType);
  }

  stats(): EventBusStats {
    const subscriptionsByType: Partial<Record<EventType, number>> = {};
    for (const sub of this.subscriptions.values()) {
      const current = subscriptionsByType[sub.eventType] ?? 0;
      subscriptionsByType[sub.eventType] = current + 1;
    }
    return {
      totalEmitted: this.totalEmitted,
      totalSubscriptions: this.subscriptions.size,
      activeSubscriptions: this.subscriptions.size,
      subscriptionsByType,
    };
  }

  createEvent<T>(
    type: EventType,
    payload: T,
    source: string,
    sessionId: string,
    correlationId?: string,
    tags?: Record<string, string>,
  ): WorkflowEvent {
    return {
      id: randomUUID(),
      type,
      timestamp: Date.now(),
      sessionId,
      source,
      payload,
      correlationId,
      sequenceNumber: ++this.sequenceCounter,
      tags,
    };
  }

  private log(message: string): void {
    console.log(`[EventBus][${this.config.logLevel.toUpperCase()}] ${message}`);
  }
}

export const createEventBus = (config?: EventBusConfig): EventBus =>
  new EventBus(config ?? { enableLogging: process.env['NODE_ENV'] !== 'production' });
