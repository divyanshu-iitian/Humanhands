import type { UIGraph, ActionRequest } from '@humanhands/shared-types';
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  MessageResponse,
} from './lib/message-types.js';

interface TabState {
  tabId: number;
  sessionId: string;
  latestGraph: UIGraph | null;
  url: string;
  isReady: boolean;
  lastUpdated: number;
}

const tabStates = new Map<number, TabState>();
let wsConnection: WebSocket | null = null;

// ─── Message Routing ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ContentToBackgroundMessage,
    sender,
    sendResponse: (r: MessageResponse) => void,
  ) => {
    const tabId = sender.tab?.id;

    if (message.type === 'OBSERVER_READY') {
      const { sessionId, url } = message.payload;
      if (tabId !== undefined) {
        tabStates.set(tabId, {
          tabId,
          sessionId,
          latestGraph: null,
          url,
          isReady: true,
          lastUpdated: Date.now(),
        });
      }
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'UI_GRAPH_UPDATE') {
      if (tabId !== undefined) {
        const state = tabStates.get(tabId);
        if (state) {
          state.latestGraph = message.payload;
          state.lastUpdated = Date.now();
        }
        streamToWebSocket({ type: 'UI_GRAPH_UPDATE', payload: message.payload });
      }
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'ACTION_RESULT') {
      streamToWebSocket({ type: 'ACTION_RESULT', payload: message.payload });
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'PAGE_CHANGED') {
      if (tabId !== undefined) {
        const state = tabStates.get(tabId);
        if (state) {
          state.url = message.payload.url;
          state.latestGraph = null;
        }
        streamToWebSocket({ type: 'PAGE_CHANGED', payload: message.payload });
      }
      sendResponse({ success: true });
      return false;
    }

    return false;
  },
);

// ─── External API (from devtools / native messaging) ─────────────────────────

chrome.runtime.onMessageExternal?.addListener(
  (
    message: { type: string; tabId?: number; payload?: unknown },
    _sender,
    sendResponse: (r: MessageResponse) => void,
  ) => {
    if (message.type === 'GET_UI_GRAPH' && message.tabId !== undefined) {
      const state = tabStates.get(message.tabId);
      sendResponse({ success: true, data: state?.latestGraph ?? null });
      return false;
    }

    if (message.type === 'EXECUTE_ACTION' && message.tabId !== undefined) {
      const request = message.payload as ActionRequest;
      sendActionToTab(message.tabId, request).then(sendResponse).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    if (message.type === 'LIST_SESSIONS') {
      const sessions = Array.from(tabStates.values()).map((s) => ({
        tabId: s.tabId,
        sessionId: s.sessionId,
        url: s.url,
        isReady: s.isReady,
        lastUpdated: s.lastUpdated,
      }));
      sendResponse({ success: true, data: sessions });
      return false;
    }

    return false;
  },
);

// ─── Tab lifecycle ────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    const state = tabStates.get(tabId);
    if (state) {
      state.isReady = false;
      state.latestGraph = null;
    }
  }
});

// ─── Content Script Communication ────────────────────────────────────────────

async function sendActionToTab(
  tabId: number,
  request: ActionRequest,
): Promise<MessageResponse> {
  const msg: BackgroundToContentMessage = { type: 'EXECUTE_ACTION', payload: request };
  return chrome.tabs.sendMessage(tabId, msg);
}

// ─── WebSocket Streaming (future) ────────────────────────────────────────────

function streamToWebSocket(data: unknown): void {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) return;
  try {
    wsConnection.send(JSON.stringify(data));
  } catch {
    // WS not available — silently skip
  }
}

// Storage-based session persistence across service worker restarts
chrome.storage.session?.get(['sessions'], (result: Record<string, unknown>) => {
  const stored = result['sessions'];
  if (Array.isArray(stored)) {
    for (const s of stored as TabState[]) {
      tabStates.set(s.tabId, s);
    }
  }
});
