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

export interface RuntimeStateMessage {
  type: 'RUNTIME_STATE';
  payload: { sessionId: string; mutationCount: number; isReady: boolean };
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

export interface GetStateMessage {
  type: 'GET_STATE';
  payload: Record<string, never>;
}

export interface PingMessage {
  type: 'PING';
  payload: Record<string, never>;
}

// ─── External API → Background ───────────────────────────────────────────────

export interface GetUIGraphMessage {
  type: 'GET_UI_GRAPH';
  payload: { tabId: number };
}

export interface ExecuteActionExternalMessage {
  type: 'EXECUTE_ACTION';
  payload: { tabId: number; request: ActionRequest };
}

export interface ListSessionsMessage {
  type: 'LIST_SESSIONS';
  payload: Record<string, never>;
}

// ─── Discriminated union types ────────────────────────────────────────────────

export type ContentToBackgroundMessage =
  | UIGraphUpdateMessage
  | ActionResultMessage
  | ObserverReadyMessage
  | PageChangedMessage
  | RuntimeStateMessage;

export type BackgroundToContentMessage =
  | ExecuteActionMessage
  | ExtractUIMessage
  | GetStateMessage
  | PingMessage;

export type ExternalToBackgroundMessage =
  | GetUIGraphMessage
  | ExecuteActionExternalMessage
  | ListSessionsMessage
  | PingMessage;

export type ExtensionMessage =
  | ContentToBackgroundMessage
  | BackgroundToContentMessage
  | ExternalToBackgroundMessage;

// ─── Response types ───────────────────────────────────────────────────────────

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GraphUpdateEvent {
  type: 'UI_GRAPH_UPDATE';
  tabId: number;
  sessionId: string;
  graph: UIGraph;
  timestamp: number;
}

export interface ActionCompletedEvent {
  type: 'ACTION_COMPLETED';
  tabId: number;
  sessionId: string;
  result: ActionResult;
  timestamp: number;
}

export type StreamEvent = GraphUpdateEvent | ActionCompletedEvent;
