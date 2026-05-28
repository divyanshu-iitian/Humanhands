import type { UIGraph, ActionRequest, ActionResult } from '@humanhands/shared-types';
import type { SessionManager } from './session-manager.js';
import type { WebSocketClient } from './websocket-client.js';

export interface IncomingMessage {
  type: string;
  payload: unknown;
}

export interface OutgoingResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

type RouteHandler<T = unknown> = (
  payload: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<OutgoingResponse<T>> | OutgoingResponse<T>;

const REQUEST_TIMEOUT_MS = 15000;

export class MessageRouter {
  private readonly handlers = new Map<string, RouteHandler>();
  private readonly sessionManager: SessionManager;
  private readonly wsClient: WebSocketClient;

  constructor(sessionManager: SessionManager, wsClient: WebSocketClient) {
    this.sessionManager = sessionManager;
    this.wsClient = wsClient;
    this.registerDefaultHandlers();
  }

  /**
   * Register a typed handler for a specific message type.
   */
  register<T>(type: string, handler: RouteHandler<T>): void {
    this.handlers.set(type, handler as RouteHandler);
  }

  /**
   * Attach to chrome.runtime.onMessage to route content-script messages.
   */
  attachContentScriptListener(): void {
    chrome.runtime.onMessage.addListener(
      (
        message: IncomingMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: OutgoingResponse) => void,
      ) => {
        const handler = this.handlers.get(message.type);
        if (!handler) {
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
          return false;
        }

        const result = handler(message.payload, sender);

        if (result instanceof Promise) {
          const timer = setTimeout(() => {
            sendResponse({ success: false, error: 'Handler timeout' });
          }, REQUEST_TIMEOUT_MS);

          result
            .then((res) => {
              clearTimeout(timer);
              sendResponse(res);
            })
            .catch((err) => {
              clearTimeout(timer);
              sendResponse({ success: false, error: String(err) });
            });

          return true; // keep message channel open
        }

        sendResponse(result);
        return false;
      },
    );
  }

  /**
   * Attach to chrome.runtime.onMessageExternal for external API/devtools connections.
   */
  attachExternalListener(): void {
    if (!chrome.runtime.onMessageExternal) return;

    chrome.runtime.onMessageExternal.addListener(
      (
        message: IncomingMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: OutgoingResponse) => void,
      ) => {
        const handler = this.handlers.get(message.type);
        if (!handler) {
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
          return false;
        }

        const result = handler(message.payload, sender);
        if (result instanceof Promise) {
          result
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ success: false, error: String(err) }));
          return true;
        }
        sendResponse(result);
        return false;
      },
    );
  }

  /**
   * Send a message to a specific tab's content script.
   * Returns the response or null on timeout/error.
   */
  async sendToTab<T>(
    tabId: number,
    type: string,
    payload: unknown,
  ): Promise<OutgoingResponse<T> | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS);

      chrome.tabs.sendMessage(
        tabId,
        { type, payload },
        (response: OutgoingResponse<T> | undefined) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response ?? null);
        },
      );
    });
  }

  private registerDefaultHandlers(): void {
    // ── Content Script → Background ──────────────────────────────────────

    this.register('OBSERVER_READY', (payload, sender) => {
      const { sessionId, url } = payload as { sessionId: string; url: string; tabId: number };
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        const title = sender.tab?.title ?? '';
        this.sessionManager.createOrUpdate(tabId, sessionId, url, title);
        this.sessionManager.markReady(tabId);
      }
      return { success: true };
    });

    this.register('UI_GRAPH_UPDATE', (payload, sender) => {
      const graph = payload as UIGraph;
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        this.sessionManager.updateGraph(tabId, graph);
      }
      this.wsClient.send({ type: 'UI_GRAPH_UPDATE', payload: graph });
      return { success: true };
    });

    this.register('ACTION_RESULT', (payload) => {
      const result = payload as ActionResult;
      this.wsClient.send({ type: 'ACTION_RESULT', payload: result });
      return { success: true };
    });

    this.register('PAGE_CHANGED', (payload, sender) => {
      const { url, title } = payload as { url: string; title: string };
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        this.sessionManager.handleTabNavigation(tabId, url);
      }
      this.wsClient.send({ type: 'PAGE_CHANGED', payload: { url, title } });
      return { success: true };
    });

    this.register('RUNTIME_STATE', (payload, sender) => {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        const { mutationCount } = payload as { mutationCount: number };
        const session = this.sessionManager.getSession(tabId);
        if (session) session.mutationCount = mutationCount;
      }
      return { success: true };
    });

    // ── External API → Background ─────────────────────────────────────────

    this.register('GET_UI_GRAPH', (payload) => {
      const { tabId } = payload as { tabId: number };
      const session = this.sessionManager.getSession(tabId);
      return { success: true, data: session?.latestGraph ?? null };
    });

    this.register('EXECUTE_ACTION', async (payload) => {
      const { tabId, request } = payload as { tabId: number; request: ActionRequest };
      const result = await this.sendToTab<ActionResult>(tabId, 'EXECUTE_ACTION', request);
      return result ?? { success: false, error: 'Tab not responding' };
    });

    this.register('EXTRACT_UI', async (payload) => {
      const { tabId, sessionId } = payload as { tabId: number; sessionId: string };
      const result = await this.sendToTab<UIGraph>(tabId, 'EXTRACT_UI', { sessionId });
      return result ?? { success: false, error: 'Tab not responding' };
    });

    this.register('LIST_SESSIONS', () => {
      return { success: true, data: this.sessionManager.listSnapshots() };
    });

    this.register('PING', () => {
      return { success: true, data: { alive: true, timestamp: Date.now() } };
    });
  }
}
