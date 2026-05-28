export interface WebSocketConfig {
  url: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  heartbeatIntervalMs?: number;
  maxQueueSize?: number;
}

export type WebSocketEvent =
  | { kind: 'connected' }
  | { kind: 'disconnected'; wasClean: boolean; code: number }
  | { kind: 'message'; data: unknown }
  | { kind: 'error'; message: string };

export type WebSocketEventHandler = (event: WebSocketEvent) => void;

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private state: ConnectionState = ConnectionState.Disconnected;
  private readonly handlers = new Set<WebSocketEventHandler>();
  private readonly messageQueue: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      maxReconnectDelayMs: config.maxReconnectDelayMs ?? 30000,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 25000,
      maxQueueSize: config.maxQueueSize ?? 200,
    };
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === ConnectionState.Connected;
  }

  get queuedCount(): number {
    return this.messageQueue.length;
  }

  onEvent(handler: WebSocketEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect(): void {
    if (this.state === ConnectionState.Connected || this.state === ConnectionState.Connecting) {
      return;
    }
    this.intentionallyClosed = false;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.state = ConnectionState.Disconnected;
    this.clearTimers();
    this.ws?.close(1000, 'Client disconnect');
    this.ws = null;
  }

  send(data: unknown): boolean {
    const serialized = JSON.stringify(data);

    if (this.isConnected && this.ws) {
      try {
        this.ws.send(serialized);
        return true;
      } catch {
        // Fall through to queue
      }
    }

    // Queue for when connection is restored
    if (this.messageQueue.length < this.config.maxQueueSize) {
      this.messageQueue.push(serialized);
    }
    return false;
  }

  private doConnect(): void {
    this.state = ConnectionState.Connecting;

    try {
      this.ws = new WebSocket(this.config.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state = ConnectionState.Connected;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushQueue();
      this.emit({ kind: 'connected' });
    };

    this.ws.onclose = (ev) => {
      this.state = ConnectionState.Disconnected;
      this.stopHeartbeat();
      this.emit({ kind: 'disconnected', wasClean: ev.wasClean, code: ev.code });

      if (!this.intentionallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.emit({ kind: 'error', message: 'WebSocket error' });
    };

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        this.emit({ kind: 'message', data });
      } catch {
        this.emit({ kind: 'message', data: ev.data });
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return;
    this.state = ConnectionState.Reconnecting;
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(1.5, this.reconnectAttempts - 1),
      this.config.maxReconnectDelayMs,
    );

    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected && this.ws) {
      const msg = this.messageQueue.shift();
      if (msg) {
        try {
          this.ws.send(msg);
        } catch {
          this.messageQueue.unshift(msg);
          break;
        }
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws) {
        try {
          this.ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
        } catch {
          // Ignore heartbeat failures — onclose will handle reconnect
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emit(event: WebSocketEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // handler errors must not crash the client
      }
    }
  }
}
