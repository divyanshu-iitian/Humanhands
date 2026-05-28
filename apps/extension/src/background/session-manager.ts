import type { UIGraph } from '@humanhands/shared-types';

export interface SessionInfo {
  readonly sessionId: string;
  readonly tabId: number;
  url: string;
  title: string;
  latestGraph: UIGraph | null;
  graphHistory: UIGraph[];
  isReady: boolean;
  lastActiveAt: number;
  readonly createdAt: number;
  mutationCount: number;
}

export interface SessionSnapshot {
  sessionId: string;
  tabId: number;
  url: string;
  title: string;
  isReady: boolean;
  lastActiveAt: number;
  createdAt: number;
  hasGraph: boolean;
  elementCount: number;
}

const MAX_GRAPH_HISTORY = 5;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export class SessionManager {
  private readonly sessions = new Map<number, SessionInfo>();

  createOrUpdate(tabId: number, sessionId: string, url: string, title: string): SessionInfo {
    const existing = this.sessions.get(tabId);
    if (existing) {
      existing.sessionId === sessionId;
      existing.url = url;
      existing.title = title;
      existing.lastActiveAt = Date.now();
      return existing;
    }

    const session: SessionInfo = {
      sessionId,
      tabId,
      url,
      title,
      latestGraph: null,
      graphHistory: [],
      isReady: false,
      lastActiveAt: Date.now(),
      createdAt: Date.now(),
      mutationCount: 0,
    };
    this.sessions.set(tabId, session);
    this.persistSessions();
    return session;
  }

  markReady(tabId: number): void {
    const session = this.sessions.get(tabId);
    if (session) {
      session.isReady = true;
      session.lastActiveAt = Date.now();
    }
  }

  updateGraph(tabId: number, graph: UIGraph): void {
    const session = this.sessions.get(tabId);
    if (!session) return;

    // Skip identical graphs (same checksum)
    if (session.latestGraph?.checksum === graph.checksum) return;

    // Push previous to history
    if (session.latestGraph) {
      session.graphHistory.push(session.latestGraph);
      if (session.graphHistory.length > MAX_GRAPH_HISTORY) {
        session.graphHistory.shift();
      }
    }

    session.latestGraph = graph;
    session.url = graph.url;
    session.title = graph.title;
    session.lastActiveAt = Date.now();
  }

  getSession(tabId: number): SessionInfo | undefined {
    return this.sessions.get(tabId);
  }

  getSessionBySessionId(sessionId: string): SessionInfo | undefined {
    for (const session of this.sessions.values()) {
      if (session.sessionId === sessionId) return session;
    }
    return undefined;
  }

  removeSession(tabId: number): void {
    this.sessions.delete(tabId);
    this.persistSessions();
  }

  handleTabNavigation(tabId: number, url: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    session.url = url;
    session.isReady = false;
    session.latestGraph = null;
    session.lastActiveAt = Date.now();
  }

  listSnapshots(): SessionSnapshot[] {
    return Array.from(this.sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      tabId: s.tabId,
      url: s.url,
      title: s.title,
      isReady: s.isReady,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      hasGraph: s.latestGraph !== null,
      elementCount: s.latestGraph?.elements.length ?? 0,
    }));
  }

  pruneExpiredSessions(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [tabId, session] of this.sessions) {
      if (session.lastActiveAt < cutoff) {
        this.sessions.delete(tabId);
      }
    }
  }

  async restoreFromStorage(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.session.get(['hh_sessions'], (result) => {
        const stored = result['hh_sessions'];
        if (Array.isArray(stored)) {
          for (const s of stored as SessionInfo[]) {
            if (typeof s.tabId === 'number') {
              this.sessions.set(s.tabId, { ...s, graphHistory: [], latestGraph: null });
            }
          }
        }
        resolve();
      });
    });
  }

  private persistSessions(): void {
    const snapshot = Array.from(this.sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      tabId: s.tabId,
      url: s.url,
      title: s.title,
      isReady: s.isReady,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      mutationCount: s.mutationCount,
    }));
    chrome.storage.session.set({ hh_sessions: snapshot });
  }
}
