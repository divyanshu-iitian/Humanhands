import { SessionManager } from './session-manager.js';
import { WebSocketClient } from './websocket-client.js';
import { MessageRouter } from './message-router.js';

// ─── Singletons ───────────────────────────────────────────────────────────────

export const sessionManager = new SessionManager();

export const wsClient = new WebSocketClient({
  url: 'ws://localhost:3001/stream',
  reconnectDelayMs: 2000,
  maxReconnectDelayMs: 30000,
});

export const messageRouter = new MessageRouter(sessionManager, wsClient);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // Restore sessions from storage (survives service worker restarts)
  await sessionManager.restoreFromStorage();

  // Wire up message listeners
  messageRouter.attachContentScriptListener();
  messageRouter.attachExternalListener();

  // WebSocket connection (optional — will queue messages if backend not available)
  if (process.env.NODE_ENV !== 'test') {
    wsClient.onEvent((ev) => {
      if (ev.kind === 'connected') {
        console.info('[HumanHands] WebSocket connected to backend');
      }
      if (ev.kind === 'disconnected') {
        console.warn('[HumanHands] WebSocket disconnected — messages will be queued');
      }
      if (ev.kind === 'message') {
        handleBackendMessage(ev.data);
      }
    });
    // Don't auto-connect on startup — connect when backend URL is configured
    // wsClient.connect();
  }

  // Tab lifecycle management
  chrome.tabs.onRemoved.addListener((tabId) => {
    sessionManager.removeSession(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      sessionManager.handleTabNavigation(tabId, changeInfo.url);
    }
  });

  // Prune stale sessions periodically (service workers are ephemeral, so this
  // runs whenever the worker wakes up)
  sessionManager.pruneExpiredSessions();

  console.info('[HumanHands] Background runtime initialized');
}

function handleBackendMessage(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const msg = data as { type: string; tabId?: number; payload?: unknown };

  switch (msg.type) {
    case 'EXECUTE_ACTION': {
      if (typeof msg.tabId !== 'number') return;
      messageRouter
        .sendToTab(msg.tabId, 'EXECUTE_ACTION', msg.payload)
        .catch(() => { /* Tab may not exist */ });
      break;
    }
    case 'EXTRACT_UI': {
      if (typeof msg.tabId !== 'number') return;
      messageRouter
        .sendToTab(msg.tabId, 'EXTRACT_UI', msg.payload)
        .catch(() => { /* Tab may not exist */ });
      break;
    }
    case 'PONG':
      break;
    default:
      console.warn('[HumanHands] Unknown backend message type:', msg.type);
  }
}

// Run bootstrap
bootstrap().catch((err) => {
  console.error('[HumanHands] Background bootstrap failed:', err);
});
