import type { PlasmoCSConfig } from 'plasmo';
import type { ActionRequest, UIGraph } from '@humanhands/shared-types';
import { RuntimeManager } from '../runtime/runtime-manager.js';

export const config: PlasmoCSConfig = {
  matches: ['<all_urls>'],
  all_frames: false,
  run_at: 'document_idle',
  world: 'MAIN',
};

// ─── Runtime bootstrap ───────────────────────────────────────────────────────

let manager: RuntimeManager | null = null;

function getSessionId(): string {
  const stored = sessionStorage.getItem('__hh_session_id__');
  if (stored) return stored;
  const id = crypto.randomUUID();
  sessionStorage.setItem('__hh_session_id__', id);
  return id;
}

async function bootstrap(): Promise<void> {
  const sessionId = getSessionId();

  manager = new RuntimeManager({
    sessionId,
    debounceMs: 350,
    enableDebug: true,

    onGraphUpdate(graph: UIGraph) {
      sendToBackground('UI_GRAPH_UPDATE', graph);
    },

    onActionResult(result) {
      sendToBackground('ACTION_RESULT', result);
    },
  });

  const graph = await manager.init();

  sendToBackground('OBSERVER_READY', {
    sessionId,
    url: window.location.href,
    tabId: -1, // Chrome fills actual tabId in background
  });

  sendToBackground('UI_GRAPH_UPDATE', graph);
}

function sendToBackground(type: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {
    // Background may not be ready yet — silently ignore
  });
}

// ─── Message listener (background → content) ─────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload: unknown },
    _sender,
    sendResponse: (r: unknown) => void,
  ) => {
    if (!manager) {
      sendResponse({ success: false, error: 'Runtime not initialized' });
      return false;
    }

    switch (message.type) {
      case 'PING':
        sendResponse({ success: true, data: { alive: true, sessionId: manager.sessionId } });
        return false;

      case 'EXTRACT_UI': {
        const { sessionId } = message.payload as { sessionId: string };
        manager.updateSession(sessionId);
        const graph = manager.currentGraph;
        if (graph) {
          sendToBackground('UI_GRAPH_UPDATE', graph);
          sendResponse({ success: true, data: graph });
        } else {
          // Force re-extraction if no graph available
          void bootstrap().then(() => {
            sendResponse({ success: true, data: manager?.currentGraph ?? null });
          });
        }
        return true;
      }

      case 'EXECUTE_ACTION': {
        const request = message.payload as ActionRequest;
        manager
          .executeAction(request)
          .then((result) => {
            sendToBackground('ACTION_RESULT', result);
            sendResponse({ success: true, data: result });
          })
          .catch((err) => {
            sendResponse({ success: false, error: String(err) });
          });
        return true; // keep message channel open for async response
      }

      case 'GET_STATE': {
        sendResponse({
          success: true,
          data: {
            sessionId: manager.sessionId,
            hasGraph: manager.currentGraph !== null,
            url: window.location.href,
          },
        });
        return false;
      }

      default:
        return false;
    }
  },
);

// ─── Init ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void bootstrap(), { once: true });
} else {
  void bootstrap();
}
