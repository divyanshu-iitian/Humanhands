import type { WorkflowRecording, UIGraph, UIElement, ActionType } from '@humanhands/shared-types';
import type { EventBus } from '@humanhands/event-system';
import { RecordingSession, type RecordingSessionConfig } from './RecordingSession.js';
import { ActionCaptureEngine, type CaptureInput } from './ActionCaptureEngine.js';

export interface RecorderConfig {
  sessionId: string;
  eventBus?: EventBus;
}

/**
 * WorkflowRecorder orchestrates recording sessions.
 * One recorder can manage multiple sequential recordings.
 */
export class WorkflowRecorder {
  private activeSession: RecordingSession | null = null;
  private readonly captureEngine: ActionCaptureEngine;
  private readonly completedRecordings = new Map<string, WorkflowRecording>();
  private currentGraph: UIGraph | null = null;
  private readonly config: RecorderConfig;

  constructor(config: RecorderConfig) {
    this.config = config;
    this.captureEngine = new ActionCaptureEngine(config.sessionId);
  }

  startRecording(options: Pick<RecordingSessionConfig, 'name' | 'description' | 'tags'>): string {
    if (this.activeSession?.isActive) {
      this.activeSession.complete();
      this.archiveSession(this.activeSession);
    }

    this.activeSession = new RecordingSession({
      ...options,
      sessionId: this.config.sessionId,
    });

    this.emit('RECORDING_STARTED', {
      recordingId: this.activeSession.id,
      name: options.name,
    });

    return this.activeSession.id;
  }

  stopRecording(): WorkflowRecording | null {
    if (!this.activeSession) return null;
    const recording = this.activeSession.complete();
    this.archiveSession(this.activeSession);
    this.activeSession = null;

    this.emit('RECORDING_COMPLETED', {
      recordingId: recording.id,
      actionCount: recording.actions.length,
      duration: (recording.endedAt ?? 0) - recording.startedAt,
    });

    return recording;
  }

  pauseRecording(): void {
    this.activeSession?.pause();
    if (this.activeSession) {
      this.emit('RECORDING_PAUSED', { recordingId: this.activeSession.id });
    }
  }

  resumeRecording(): void {
    this.activeSession?.resume();
    if (this.activeSession) {
      this.emit('RECORDING_RESUMED', { recordingId: this.activeSession.id });
    }
  }

  cancelRecording(): void {
    if (this.activeSession) {
      this.activeSession.cancel();
      this.emit('RECORDING_CANCELLED', { recordingId: this.activeSession.id });
      this.activeSession = null;
    }
  }

  updateGraph(graph: UIGraph): void {
    this.currentGraph = graph;
  }

  /**
   * Capture an action event from the executor or browser runtime.
   * This is the primary ingestion point.
   */
  captureAction(
    actionType: ActionType,
    options: {
      element?: UIElement;
      value?: string;
      url?: string;
      duration?: number;
      retryCount?: number;
      succeeded?: boolean;
      triggeredBy?: 'user' | 'automation' | 'unknown';
    } = {},
  ): void {
    if (!this.activeSession?.isActive) return;

    const captureInput: CaptureInput = {
      actionType,
      element: options.element,
      value: options.value,
      url: options.url,
      currentGraph: this.currentGraph,
      duration: options.duration,
      retryCount: options.retryCount,
      succeeded: options.succeeded ?? true,
      triggeredBy: options.triggeredBy ?? 'unknown',
    };

    const action = this.captureEngine.capture(captureInput);
    const recorded = this.activeSession.appendAction(action);

    this.emit('ACTION_CAPTURED', {
      recordingId: this.activeSession.id,
      actionId: recorded.id,
      actionType,
      sequenceNumber: recorded.sequenceNumber,
    });
  }

  get isRecording(): boolean {
    return this.activeSession?.isActive ?? false;
  }

  get activeRecordingId(): string | null {
    return this.activeSession?.id ?? null;
  }

  getRecording(id: string): WorkflowRecording | undefined {
    if (this.activeSession?.id === id) return this.activeSession.toSnapshot();
    return this.completedRecordings.get(id);
  }

  listRecordings(): WorkflowRecording[] {
    const all: WorkflowRecording[] = Array.from(this.completedRecordings.values());
    if (this.activeSession) all.unshift(this.activeSession.toSnapshot());
    return all;
  }

  private archiveSession(session: RecordingSession): void {
    const snapshot = session.toSnapshot();
    this.completedRecordings.set(snapshot.id, snapshot);
  }

  private emit(type: string, payload: unknown): void {
    if (!this.config.eventBus) return;
    const event = this.config.eventBus.createEvent(
      'STATE_UPDATED' as Parameters<typeof this.config.eventBus.createEvent>[0],
      { subtype: type, ...((payload as object) ?? {}) },
      'workflow-recorder',
      this.config.sessionId,
    );
    this.config.eventBus.emit(event);
  }
}
