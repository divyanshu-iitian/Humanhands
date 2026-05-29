/**
 * In-page workflow recorder for the extension DevTools.
 *
 * Augments window.__HUMANHANDS_DEBUG__ with workflow recording capabilities.
 * Also exposes a standalone WorkflowDebugger class for step-through inspection.
 */

import type { ActionRequest, ActionResult, UIGraph } from '@humanhands/shared-types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecordedActionEntry {
  sequenceNumber: number;
  timestamp: number;
  actionType: string;
  targetSelector: string | null;
  targetText: string | null;
  value: string | undefined;
  url: string;
  pageTitle: string;
  succeeded: boolean;
  duration: number;
}

interface RecordingState {
  id: string;
  name: string;
  status: 'recording' | 'paused' | 'stopped';
  startedAt: number;
  actions: RecordedActionEntry[];
}

// ─── DevTools Recorder ───────────────────────────────────────────────────────

export class WorkflowDevToolsRecorder {
  private recording: RecordingState | null = null;
  private sequenceCounter = 0;

  startRecording(name: string): string {
    const id = crypto.randomUUID();
    this.recording = {
      id,
      name,
      status: 'recording',
      startedAt: Date.now(),
      actions: [],
    };
    this.sequenceCounter = 0;
    console.info(`[HumanHands] Recording started: "${name}" (${id})`);
    return id;
  }

  stopRecording(): RecordingState | null {
    if (!this.recording) return null;
    this.recording.status = 'stopped';
    const snapshot = structuredClone(this.recording);
    console.info(
      `[HumanHands] Recording stopped: ${snapshot.actions.length} actions captured`,
    );
    return snapshot;
  }

  pauseRecording(): void {
    if (this.recording) this.recording.status = 'paused';
  }

  resumeRecording(): void {
    if (this.recording) this.recording.status = 'recording';
  }

  get isRecording(): boolean {
    return this.recording?.status === 'recording';
  }

  captureFromAction(request: ActionRequest, result: ActionResult): void {
    if (!this.recording || this.recording.status !== 'recording') return;

    const target = request.target;
    const entry: RecordedActionEntry = {
      sequenceNumber: this.sequenceCounter++,
      timestamp: Date.now(),
      actionType: request.type,
      targetSelector:
        target?.kind === 'selector' ? target.selector : null,
      targetText: target?.kind === 'text' ? target.text : null,
      value: request.value,
      url: window.location.href,
      pageTitle: document.title,
      succeeded: result.success,
      duration: result.duration,
    };

    this.recording.actions.push(entry);
  }

  getRecording(): RecordingState | null {
    return this.recording ? structuredClone(this.recording) : null;
  }

  exportAsJSON(): string {
    return JSON.stringify(this.recording, null, 2);
  }
}

// ─── Step-through Debugger ───────────────────────────────────────────────────

export class WorkflowDebugger {
  private readonly steps: ActionRequest[];
  private currentIndex = 0;
  private readonly executionLog: Array<{
    step: ActionRequest;
    result?: ActionResult;
    error?: string;
    timestamp: number;
  }> = [];

  constructor(steps: ActionRequest[]) {
    this.steps = steps;
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  get currentStepIndex(): number {
    return this.currentIndex;
  }

  get currentStep(): ActionRequest | undefined {
    return this.steps[this.currentIndex];
  }

  get isComplete(): boolean {
    return this.currentIndex >= this.steps.length;
  }

  logStepResult(result: ActionResult): void {
    const step = this.steps[this.currentIndex];
    if (step) {
      this.executionLog.push({ step, result, timestamp: Date.now() });
    }
    this.currentIndex++;
  }

  logStepError(error: string): void {
    const step = this.steps[this.currentIndex];
    if (step) {
      this.executionLog.push({ step, error, timestamp: Date.now() });
    }
  }

  rewind(stepIndex: number): void {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      this.currentIndex = stepIndex;
    }
  }

  getExecutionLog() {
    return [...this.executionLog];
  }

  inspectStep(index: number): {
    step: ActionRequest;
    selector: string | null;
    element: Element | null;
    isPresent: boolean;
  } | null {
    const step = this.steps[index];
    if (!step) return null;

    const target = step.target;
    let selector: string | null = null;
    let element: Element | null = null;

    if (target?.kind === 'selector') {
      selector = target.selector;
      try {
        element = document.querySelector(selector);
      } catch { element = null; }
    } else if (target?.kind === 'element-id') {
      selector = `[data-hh-id="${target.elementId}"]`;
      element = document.querySelector(selector);
    }

    return { step, selector, element, isPresent: element !== null };
  }

  printTimeline(): void {
    console.group('[HumanHands] Workflow Execution Timeline');
    for (const entry of this.executionLog) {
      const icon = entry.result?.success ? '✅' : entry.error ? '❌' : '⏭️';
      const target = entry.step.target;
      const selector = target?.kind === 'selector' ? target.selector : 'N/A';
      console.log(
        `${icon} Step ${entry.step.type}: ${selector}`,
        entry.result?.duration ? `(${entry.result.duration}ms)` : '',
        entry.error ? `ERROR: ${entry.error}` : '',
      );
    }
    console.groupEnd();
  }
}

// ─── Install on window.__HUMANHANDS_DEBUG__ ───────────────────────────────────

declare global {
  interface Window {
    __HUMANHANDS_DEBUG__: {
      recorder?: WorkflowDevToolsRecorder;
      [key: string]: unknown;
    };
  }
}

export function installWorkflowDevTools(): void {
  const recorder = new WorkflowDevToolsRecorder();

  if (!window.__HUMANHANDS_DEBUG__) {
    console.warn('[HumanHands] Debug interface not yet installed — call after RuntimeManager.init()');
    return;
  }

  Object.assign(window.__HUMANHANDS_DEBUG__, {
    recorder,
    startRecording: (name: string) => recorder.startRecording(name),
    stopRecording: () => recorder.stopRecording(),
    pauseRecording: () => recorder.pauseRecording(),
    resumeRecording: () => recorder.resumeRecording(),
    getRecording: () => recorder.getRecording(),
    exportRecording: () => recorder.exportAsJSON(),
    createDebugger: (steps: ActionRequest[]) => new WorkflowDebugger(steps),
  });

  console.info('[HumanHands] Workflow DevTools installed. Use window.__HUMANHANDS_DEBUG__.startRecording("name")');
}
