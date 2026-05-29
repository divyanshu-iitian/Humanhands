import { randomUUID } from 'crypto';
import type {
  RecordedAction,
  WorkflowRecording,
  WorkflowRecordingStatus,
} from '@humanhands/shared-types';

export interface RecordingSessionConfig {
  name: string;
  sessionId: string;
  description?: string;
  tags?: string[];
}

export class RecordingSession {
  private readonly recording: WorkflowRecording;
  private sequenceCounter = 0;

  constructor(config: RecordingSessionConfig) {
    this.recording = {
      id: randomUUID(),
      name: config.name,
      description: config.description,
      sessionId: config.sessionId,
      status: 'recording',
      startedAt: Date.now(),
      endedAt: undefined,
      actions: [],
      pageHistory: [],
      startUrl: '',
      endUrl: undefined,
      metadata: {},
      tags: config.tags ?? [],
    };
  }

  get id(): string {
    return this.recording.id;
  }

  get status(): WorkflowRecordingStatus {
    return this.recording.status;
  }

  get actionCount(): number {
    return this.recording.actions.length;
  }

  get isActive(): boolean {
    return this.recording.status === 'recording';
  }

  appendAction(action: Omit<RecordedAction, 'recordingId' | 'sequenceNumber'>): RecordedAction {
    const enriched: RecordedAction = {
      ...action,
      recordingId: this.recording.id,
      sequenceNumber: this.sequenceCounter++,
    };
    this.recording.actions.push(enriched);

    // Track page history
    const url = action.pageContext.url;
    if (this.recording.pageHistory.at(-1) !== url) {
      this.recording.pageHistory.push(url);
    }
    if (!this.recording.startUrl) {
      this.recording.startUrl = url;
    }

    return enriched;
  }

  pause(): void {
    if (this.recording.status === 'recording') {
      this.recording.status = 'paused';
    }
  }

  resume(): void {
    if (this.recording.status === 'paused') {
      this.recording.status = 'recording';
    }
  }

  complete(): WorkflowRecording {
    this.recording.status = 'completed';
    this.recording.endedAt = Date.now();
    this.recording.endUrl = this.recording.pageHistory.at(-1);
    return this.toSnapshot();
  }

  cancel(): void {
    this.recording.status = 'cancelled';
    this.recording.endedAt = Date.now();
  }

  toSnapshot(): WorkflowRecording {
    return structuredClone(this.recording);
  }

  getLastAction(): RecordedAction | undefined {
    return this.recording.actions.at(-1);
  }

  getActionsForUrl(url: string): RecordedAction[] {
    return this.recording.actions.filter((a) => a.pageContext.url === url);
  }
}
