import { randomUUID } from 'crypto';
import type {
  CompiledWorkflow,
  CompiledStep,
  StepExecutionResult,
  WorkflowExecutionResult,
  WorkflowExecutionSummary,
  ExecutionMode,
  StepStatus,
} from '@humanhands/shared-types';

export class ExecutionContext {
  readonly executionId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly sessionId: string;
  readonly mode: ExecutionMode;
  readonly resolvedVariables: Record<string, unknown>;
  readonly startedAt: number;

  private status: WorkflowExecutionResult['status'] = 'pending';
  private currentStepIndex = 0;
  private readonly stepResults = new Map<string, StepExecutionResult>();
  private failedAtStep: string | undefined;
  private errorMessage: string | undefined;

  constructor(
    workflow: CompiledWorkflow,
    sessionId: string,
    mode: ExecutionMode,
    variables: Record<string, unknown>,
  ) {
    this.executionId = randomUUID();
    this.workflowId = workflow.id;
    this.workflowVersion = workflow.version;
    this.sessionId = sessionId;
    this.mode = mode;
    this.resolvedVariables = variables;
    this.startedAt = Date.now();
  }

  get currentStep(): number {
    return this.currentStepIndex;
  }

  get isRunning(): boolean {
    return this.status === 'running';
  }

  start(): void {
    this.status = 'running';
  }

  markStepStarted(step: CompiledStep): void {
    this.stepResults.set(step.id, {
      stepId: step.id,
      stepName: step.name,
      status: 'running',
      startedAt: Date.now(),
      retryCount: 0,
    });
  }

  markStepCompleted(
    stepId: string,
    update: Partial<StepExecutionResult>,
  ): void {
    const existing = this.stepResults.get(stepId);
    if (!existing) return;

    const completedAt = Date.now();
    this.stepResults.set(stepId, {
      ...existing,
      ...update,
      status: update.status ?? 'success',
      completedAt,
      duration: completedAt - existing.startedAt,
    });
    this.currentStepIndex++;
  }

  markStepFailed(stepId: string, error: string, retryCount: number): void {
    const existing = this.stepResults.get(stepId);
    const completedAt = Date.now();
    if (existing) {
      this.stepResults.set(stepId, {
        ...existing,
        status: 'failed',
        completedAt,
        duration: completedAt - existing.startedAt,
        error,
        retryCount,
      });
    }
    this.failedAtStep = stepId;
    this.errorMessage = error;
    this.currentStepIndex++;
  }

  markStepSkipped(stepId: string, reason: string): void {
    this.stepResults.set(stepId, {
      stepId,
      stepName: '',
      status: 'skipped',
      startedAt: Date.now(),
      completedAt: Date.now(),
      duration: 0,
      retryCount: 0,
      skippedReason: reason,
    });
    this.currentStepIndex++;
  }

  complete(): void {
    this.status = 'completed';
  }

  fail(error: string): void {
    this.status = 'failed';
    this.errorMessage = error;
  }

  abort(reason: string): void {
    this.status = 'aborted';
    this.errorMessage = reason;
  }

  toResult(): WorkflowExecutionResult {
    const stepResults = Array.from(this.stepResults.values());
    const summary = this.computeSummary(stepResults);

    return {
      executionId: this.executionId,
      workflowId: this.workflowId,
      workflowVersion: this.workflowVersion,
      sessionId: this.sessionId,
      mode: this.mode,
      status: this.status,
      startedAt: this.startedAt,
      completedAt: this.status !== 'running' ? Date.now() : undefined,
      totalDuration: this.status !== 'running' ? Date.now() - this.startedAt : undefined,
      resolvedVariables: this.resolvedVariables,
      stepResults,
      failedAtStep: this.failedAtStep,
      error: this.errorMessage,
      summary,
    };
  }

  private computeSummary(results: StepExecutionResult[]): WorkflowExecutionSummary {
    return {
      totalSteps: results.length,
      completed: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      verificationsPassed: results.filter((r) => r.verification?.passed).length,
      verificationsFailed: results.filter(
        (r) => r.verification && !r.verification.passed,
      ).length,
    };
  }
}
