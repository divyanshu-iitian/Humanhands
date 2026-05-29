import type {
  CompiledWorkflow,
  WorkflowExecutionResult,
  ExecutionMode,
} from '@humanhands/shared-types';
import type { Executor } from '@humanhands/executor';
import type { EventBus } from '@humanhands/event-system';
import { ExecutionContext } from './ExecutionContext.js';
import { VariableResolver } from './VariableResolver.js';
import { StepExecutor } from './StepExecutor.js';

export interface EngineConfig {
  executor: Executor;
  eventBus?: EventBus;
}

export interface RunOptions {
  sessionId: string;
  mode?: ExecutionMode;
  inputs?: Record<string, unknown>;
  onStepComplete?: (result: WorkflowExecutionResult) => void;
}

/**
 * WorkflowEngine — the deterministic replay engine.
 *
 * Execution pipeline per run:
 * 1. Validate workflow schema
 * 2. Resolve input variables
 * 3. Create ExecutionContext
 * 4. For each step: resolve → execute → verify → update context
 * 5. Handle failures (abort / retry / skip / fallback)
 * 6. Emit structured WorkflowExecutionResult
 */
export class WorkflowEngine {
  private readonly variableResolver = new VariableResolver();
  private readonly config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
  }

  async run(
    workflow: CompiledWorkflow,
    options: RunOptions,
  ): Promise<WorkflowExecutionResult> {
    const mode = options.mode ?? 'production';
    const inputs = options.inputs ?? {};

    // ── 1. Variable resolution ────────────────────────────────────────────
    const { resolved, missing, invalid } = this.variableResolver.resolve(workflow, inputs);

    if (missing.length > 0) {
      return this.earlyFailure(workflow, options, mode, resolved,
        `Missing required variables: ${missing.join(', ')}`);
    }
    if (invalid.length > 0) {
      return this.earlyFailure(workflow, options, mode, resolved,
        `Invalid variable values: ${invalid.map((v) => `${v.name} — ${v.reason}`).join('; ')}`);
    }

    // ── 2. Execution context ──────────────────────────────────────────────
    const context = new ExecutionContext(workflow, options.sessionId, mode, resolved);
    const stepExecutor = new StepExecutor(this.config.executor, this.variableResolver, mode);

    context.start();
    this.emitEvent('WORKFLOW_STARTED', { workflowId: workflow.id, executionId: context.executionId }, options.sessionId);

    // ── 3. Step execution loop ────────────────────────────────────────────
    for (const step of workflow.steps) {
      // Evaluate condition
      if (step.condition) {
        const conditionMet = this.evaluateCondition(step.condition, resolved);
        if (!conditionMet) {
          context.markStepSkipped(step.id, `Condition not met: ${step.condition}`);
          this.emitEvent('WORKFLOW_STEP_COMPLETED', { stepId: step.id, status: 'skipped' }, options.sessionId);
          continue;
        }
      }

      context.markStepStarted(step);
      this.emitEvent('WORKFLOW_STEP_STARTED', { stepId: step.id, name: step.name }, options.sessionId);

      const stepResult = await stepExecutor.execute(step, options.sessionId, resolved);

      if (stepResult.status === 'failed' || stepResult.error) {
        context.markStepFailed(step.id, stepResult.error ?? 'Step failed', stepResult.retryCount ?? 0);

        this.emitEvent('WORKFLOW_STEP_COMPLETED', { stepId: step.id, status: 'failed', error: stepResult.error }, options.sessionId);

        switch (step.onFailure) {
          case 'abort':
            context.fail(`Step "${step.name}" failed: ${stepResult.error}`);
            this.emitEvent('WORKFLOW_FAILED', { workflowId: workflow.id, failedStep: step.id }, options.sessionId);
            return context.toResult();

          case 'skip':
            context.markStepSkipped(step.id, `Skipped after failure: ${stepResult.error}`);
            break;

          case 'retry':
            // StepExecutor already handles retries — if we're here, retries are exhausted
            context.fail(`Step "${step.name}" failed after all retries`);
            return context.toResult();

          case 'fallback':
            if (step.fallbackStepId) {
              const fallback = workflow.steps.find((s) => s.id === step.fallbackStepId);
              if (fallback) {
                const fallbackResult = await stepExecutor.execute(fallback, options.sessionId, resolved);
                context.markStepCompleted(step.id, fallbackResult);
              }
            }
            break;
        }
      } else {
        context.markStepCompleted(step.id, stepResult);
        this.emitEvent('WORKFLOW_STEP_COMPLETED', { stepId: step.id, status: 'success' }, options.sessionId);
      }

      // Notify progress
      options.onStepComplete?.(context.toResult());
    }

    // ── 4. Complete ───────────────────────────────────────────────────────
    context.complete();
    const result = context.toResult();

    this.emitEvent('WORKFLOW_COMPLETED', {
      workflowId: workflow.id,
      executionId: context.executionId,
      summary: result.summary,
    }, options.sessionId);

    return result;
  }

  private evaluateCondition(condition: string, variables: Record<string, unknown>): boolean {
    try {
      // Simple expression evaluator — no dynamic code exec
      // Supports: {{var}} === 'value', {{var}} !== 'value'
      const resolved = condition.replace(
        /\{\{([a-z][a-z0-9_]*)\}\}/g,
        (_, name: string) => JSON.stringify(variables[name] ?? null),
      );
      const eqMatch = resolved.match(/^(.+?)\s*(===|!==|==|!=)\s*(.+)$/);
      if (eqMatch) {
        const [, left, op, right] = eqMatch;
        const l = this.safeEval(left!);
        const r = this.safeEval(right!);
        if (op === '===' || op === '==') return l === r;
        if (op === '!==' || op === '!=') return l !== r;
      }
      return true;
    } catch {
      return true;
    }
  }

  private safeEval(expr: string): unknown {
    const trimmed = expr.trim();
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
      return trimmed.slice(1, -1);
    }
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  private earlyFailure(
    workflow: CompiledWorkflow,
    options: RunOptions,
    mode: ExecutionMode,
    resolved: Record<string, unknown>,
    error: string,
  ): WorkflowExecutionResult {
    const context = new ExecutionContext(workflow, options.sessionId, mode, resolved);
    context.start();
    context.fail(error);
    return context.toResult();
  }

  private emitEvent(type: string, payload: unknown, sessionId: string): void {
    if (!this.config.eventBus) return;
    const event = this.config.eventBus.createEvent(
      type as Parameters<typeof this.config.eventBus.createEvent>[0],
      payload,
      'workflow-engine',
      sessionId,
    );
    this.config.eventBus.emit(event);
  }
}
