import type { PlasmoCSConfig } from 'plasmo';
import { randomUUID } from 'crypto';
import type { UIGraph } from '@humanhands/shared-types';
import { DomExtractor } from '../lib/dom-extractor.js';
import { PageObserver } from '../lib/page-observer.js';
import { executeAction } from '../lib/action-executor.js';
import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  MessageResponse,
} from '../lib/message-types.js';

export const config: PlasmoCSConfig = {
  matches: ['<all_urls>'],
  all_frames: false,
  run_at: 'document_idle',
};

const extractor = new DomExtractor();
let sessionId = randomUUID();
let lastChecksum: string | undefined;

// ─── UI Extraction ────────────────────────────────────────────────────────────

function buildUIGraph(): UIGraph {
  const pageId = `page_${Date.now().toString(36)}`;
  const result = extractor.extract({ sessionId, pageId });
  const elementMap: Record<string, (typeof result.elements)[0]> = {};
  const rootIds: string[] = [];
  const interactableIds: string[] = [];
  const formIds: string[] = [];
  const modalIds: string[] = [];

  for (const el of result.elements) {
    elementMap[el.id] = el;
    if (el.parentId === null) rootIds.push(el.id);
    if (el.interactable) interactableIds.push(el.id);
    if (el.role === 'form') formIds.push(el.id);
    if (el.role === 'modal' || el.role === 'dialog') modalIds.push(el.id);
  }

  const checksum = computeChecksum(result.elements.map((e) => `${e.id}:${e.text}:${e.enabled}`));

  const graph: UIGraph = {
    pageId,
    sessionId,
    url: result.url,
    title: result.title,
    timestamp: result.extractedAt,
    version: '1',
    elements: result.elements,
    elementMap,
    rootIds,
    interactableIds,
    formIds,
    modalIds,
    metadata: {
      url: result.url,
      title: result.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      isLoading: document.readyState !== 'complete',
      hasModal: modalIds.length > 0,
      totalElementCount: result.elements.length,
      interactableCount: interactableIds.length,
    },
    checksum,
    previousChecksum: lastChecksum,
  };

  lastChecksum = checksum;
  return graph;
}

function computeChecksum(parts: string[]): string {
  let hash = 0;
  const str = parts.sort().join('|');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ─── Message Sending ──────────────────────────────────────────────────────────

function sendToBackground(msg: ContentToBackgroundMessage): void {
  chrome.runtime.sendMessage(msg).catch((err) => {
    console.warn('[HumanHands] Failed to send message to background:', err);
  });
}

// ─── Message Listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundToContentMessage,
    _sender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    if (message.type === 'PING') {
      sendResponse({ success: true, data: { alive: true } });
      return false;
    }

    if (message.type === 'EXTRACT_UI') {
      sessionId = message.payload.sessionId;
      const graph = buildUIGraph();
      sendToBackground({ type: 'UI_GRAPH_UPDATE', payload: graph });
      sendResponse({ success: true, data: graph });
      return false;
    }

    if (message.type === 'EXECUTE_ACTION') {
      executeAction(message.payload)
        .then((result) => {
          sendToBackground({ type: 'ACTION_RESULT', payload: result });
          sendResponse({ success: true, data: result });
        })
        .catch((err) => {
          sendResponse({ success: false, error: String(err) });
        });
      return true; // keep message channel open for async response
    }

    return false;
  },
);

// ─── Page Observer ───────────────────────────────────────────────────────────

const observer = new PageObserver(
  (reason) => {
    const graph = buildUIGraph();
    if (reason === 'route-change') {
      sendToBackground({ type: 'PAGE_CHANGED', payload: { url: graph.url, title: graph.title, tabId: -1 } });
    }
    sendToBackground({ type: 'UI_GRAPH_UPDATE', payload: graph });
  },
  { debounceMs: 400 },
);

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  observer.start();

  const graph = buildUIGraph();
  sendToBackground({ type: 'OBSERVER_READY', payload: { sessionId, url: graph.url, tabId: -1 } });
  sendToBackground({ type: 'UI_GRAPH_UPDATE', payload: graph });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
