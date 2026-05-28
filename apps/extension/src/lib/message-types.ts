import type { UIGraph, ActionRequest, ActionResult } from '@humanhands/shared-types';

// ─── Content → Background ────────────────────────────────────────────────────

export interface UIGraphUpdateMessage {
  type: 'UI_GRAPH_UPDATE';
  payload: UIGraph;
}

export interface ActionResultMessage {
  type: 'ACTION_RESULT';
  payload: ActionResult;
}

export interface ObserverReadyMessage {
  type: 'OBSERVER_READY';
  payload: { sessionId: string; url: string; tabId: number };
}

export interface PageChangedMessage {
  type: 'PAGE_CHANGED';
  payload: { url: string; title: string; tabId: number };
}

// ─── Background → Content ────────────────────────────────────────────────────

export interface ExecuteActionMessage {
  type: 'EXECUTE_ACTION';
  payload: ActionRequest;
}

export interface ExtractUIMessage {
  type: 'EXTRACT_UI';
  payload: { sessionId: string };
}

export interface PingMessage {
  type: 'PING';
  payload: Record<string, never>;
}

// ─── Discriminated union types ────────────────────────────────────────────────

export type ContentToBackgroundMessage =
  | UIGraphUpdateMessage
  | ActionResultMessage
  | ObserverReadyMessage
  | PageChangedMessage;

export type BackgroundToContentMessage = ExecuteActionMessage | ExtractUIMessage | PingMessage;

export type ExtensionMessage = ContentToBackgroundMessage | BackgroundToContentMessage;

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
