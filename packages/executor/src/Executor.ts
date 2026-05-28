import { randomUUID } from 'crypto';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import type { ActionRequest, ActionResult, ActionErrorCode } from '@humanhands/shared-types';
import { ActionOptionsSchema } from '@humanhands/shared-types';
import type { EventBus } from '@humanhands/event-system';
import { ActionRegistry } from './ActionRegistry.js';
import { RetryHandler } from './RetryHandler.js';
import { PlaywrightSelectorEnvironment } from './PlaywrightSelectorEnvironment.js';

export interface ExecutorConfig {
  headless?: boolean;
  slowMo?: number;
  defaultTimeout?: number;
  eventBus?: EventBus;
}

export interface SessionHandle {
  sessionId: string;
  page: Page;
  context: BrowserContext;
  createdAt: number;
}

export class Executor {
  private browser: Browser | null = null;
  private readonly sessions = new Map<string, SessionHandle>();
  private readonly registry = new ActionRegistry();
  private readonly retryHandler = new RetryHandler();
  private readonly config: Required<Omit<ExecutorConfig, 'eventBus'>> & { eventBus?: EventBus };

  constructor(config: ExecutorConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      slowMo: config.slowMo ?? 0,
      defaultTimeout: config.defaultTimeout ?? 10000,
      eventBus: config.eventBus,
    };
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    });
  }

  async createSession(sessionId?: string): Promise<string> {
    if (!this.browser) throw new Error('Executor not initialized — call init() first');

    const id = sessionId ?? randomUUID();
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(this.config.defaultTimeout);

    this.sessions.set(id, { sessionId: id, page, context, createdAt: Date.now() });
    this.emitEvent('SESSION_STARTED', { sessionId: id }, id);
    return id;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    const startTime = Date.now();
    const session = this.sessions.get(request.sessionId);

    if (!session) {
      return this.buildFailedResult(request, startTime, 'UNKNOWN', `Session ${request.sessionId} not found`, false);
    }

    const action = this.registry.get(request.type);
    if (!action) {
      return this.buildFailedResult(
        request,
        startTime,
        'ACTION_NOT_SUPPORTED',
        `Action type '${request.type}' is not registered`,
        false,
      );
    }

    const validationError = action.validate(request);
    if (validationError) {
      return this.buildFailedResult(request, startTime, 'VALIDATION_FAILED', validationError, false);
    }

    const options = ActionOptionsSchema.parse(request.options ?? {});
    this.emitEvent('ACTION_STARTED', { actionId: request.id, type: request.type }, request.sessionId);

    try {
      const resolvedSelector = await this.resolveSelector(request, session.page);
      if (resolvedSelector === null) {
        return this.buildFailedResult(
          request,
          startTime,
          'ELEMENT_NOT_FOUND',
          `Could not resolve selector for target`,
          true,
        );
      }

      const { result: partialResult, retryCount } = await this.retryHandler.execute(
        async () =>
          action.execute({ page: session.page, request, resolvedSelector }),
        options,
      );

      const actionResult: ActionResult = {
        actionId: request.id,
        sessionId: request.sessionId,
        type: request.type,
        success: true,
        timestamp: startTime,
        duration: Date.now() - startTime,
        retryCount,
        selectorUsed: resolvedSelector,
        ...partialResult,
      };

      this.emitEvent('ACTION_COMPLETED', actionResult, request.sessionId);
      return actionResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorCode = this.classifyError(err);
      const actionResult = this.buildFailedResult(request, startTime, errorCode, err.message, true, err.stack);
      this.emitEvent('ACTION_FAILED', actionResult, request.sessionId);
      return actionResult;
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    await session.context.close();
    this.sessions.delete(sessionId);
    this.emitEvent('SESSION_ENDED', { sessionId }, sessionId);
  }

  async shutdown(): Promise<void> {
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    await this.browser?.close();
    this.browser = null;
  }

  private async resolveSelector(request: ActionRequest, page: Page): Promise<string | null> {
    if (!request.target) return '';

    const env = new PlaywrightSelectorEnvironment(page);

    if (request.target.kind === 'selector') {
      const selectors = [request.target.selector, ...(request.target.fallbackSelectors ?? [])];
      const match = await env.resolveFirstMatchingSelector(selectors);
      return match?.selector ?? null;
    }

    if (request.target.kind === 'text') {
      const rolePrefix = request.target.role ? `${request.target.role}` : '*';
      const textSelector = `${rolePrefix}:has-text("${request.target.text}")`;
      const count = await env.queryCountAsync(textSelector);
      return count > 0 ? textSelector : null;
    }

    if (request.target.kind === 'element-id') {
      return `[data-hh-id="${request.target.elementId}"]`;
    }

    return null;
  }

  private buildFailedResult(
    request: ActionRequest,
    startTime: number,
    code: ActionErrorCode,
    message: string,
    retryable: boolean,
    stack?: string,
  ): ActionResult {
    return {
      actionId: request.id,
      sessionId: request.sessionId,
      type: request.type,
      success: false,
      timestamp: startTime,
      duration: Date.now() - startTime,
      retryCount: 0,
      error: { code, message, retryable, stack },
    };
  }

  private classifyError(error: Error): ActionErrorCode {
    const msg = error.message.toLowerCase();
    if (msg.includes('not found') || msg.includes('no element')) return 'ELEMENT_NOT_FOUND';
    if (msg.includes('not visible') || msg.includes('hidden')) return 'ELEMENT_NOT_VISIBLE';
    if (msg.includes('not interactable') || msg.includes('disabled')) return 'ELEMENT_NOT_INTERACTABLE';
    if (msg.includes('timeout')) return 'TIMEOUT';
    if (msg.includes('navigation')) return 'NAVIGATION_FAILED';
    return 'UNKNOWN';
  }

  private emitEvent(type: string, payload: unknown, sessionId: string): void {
    if (!this.config.eventBus) return;
    const event = this.config.eventBus.createEvent(
      type as Parameters<typeof this.config.eventBus.createEvent>[0],
      payload,
      'executor',
      sessionId,
    );
    this.config.eventBus.emit(event);
  }
}
