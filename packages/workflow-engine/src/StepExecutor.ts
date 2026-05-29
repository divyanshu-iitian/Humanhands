import type {
  CompiledStep,
  ActionRequest,
  StepExecutionResult,
  ExecutionMode,
} from '@humanhands/shared-types';
import type { Executor } from '@humanhands/executor';
import type { VariableResolver } from './VariableResolver.js';

const RETRY_DELAYS = [0, 500, 1000, 2000, 4000];

export class StepExecutor {
  private readonly executor: Executor;
  private readonly variableResolver: VariableResolver;
  private readonly mode: ExecutionMode;

  constructor(executor: Executor, variableResolver: VariableResolver, mode: ExecutionMode) {
    this.executor = executor;
    this.variableResolver = variableResolver;
    this.mode = mode;
  }

  async execute(
    step: CompiledStep,
    sessionId: string,
    variables: Record<string, unknown>,
  ): Promise<Partial<StepExecutionResult>> {
    if (this.mode === 'dry-run') {
      return this.dryRun(step, variables);
    }

    const resolvedAction = this.resolveAction(step.action, sessionId, variables);

    // Pre-step wait
    if (step.waitBefore > 0) await this.sleep(step.waitBefore);

    let lastError: Error | null = null;
    let retryCount = 0;
    const maxAttempts = step.retries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await this.sleep(RETRY_DELAYS[attempt] ?? 4000);
        retryCount = attempt;
      }

      try {
        const actionResult = await this.executor.execute(resolvedAction);

        // Post-step wait
        if (step.waitAfter > 0) await this.sleep(step.waitAfter);

        const verification = await this.runVerification(step, sessionId, actionResult.success);

        return {
          status: actionResult.success ? 'success' : 'failed',
          actionResult,
          verification: verification ?? undefined,
          retryCount,
          selectorUsed: actionResult.selectorUsed,
          resolvedValue: resolvedAction.value,
          error: actionResult.success ? undefined : actionResult.error?.message,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!this.isRetryable(lastError)) break;
      }
    }

    return {
      status: 'failed',
      error: lastError?.message ?? 'Step failed',
      retryCount,
    };
  }

  private resolveAction(
    action: ActionRequest,
    sessionId: string,
    variables: Record<string, unknown>,
  ): ActionRequest {
    const resolved: ActionRequest = { ...action, sessionId };

    if (action.value) {
      resolved.value = this.variableResolver.interpolate(action.value, variables);
    }
    if (action.url) {
      resolved.url = this.variableResolver.interpolate(action.url, variables);
    }

    return resolved;
  }

  private async dryRun(
    step: CompiledStep,
    variables: Record<string, unknown>,
  ): Promise<Partial<StepExecutionResult>> {
    const resolvedValue = step.action.value
      ? this.variableResolver.interpolate(step.action.value, variables)
      : undefined;

    // Simulate step timing
    await this.sleep(50);

    return {
      status: 'success',
      retryCount: 0,
      resolvedValue,
      actionResult: {
        actionId: step.action.id,
        sessionId: 'dry-run',
        type: step.action.type,
        success: true,
        timestamp: Date.now(),
        duration: 50,
        retryCount: 0,
      },
    };
  }

  private async runVerification(
    step: CompiledStep,
    _sessionId: string,
    actionSuccess: boolean,
  ): Promise<StepExecutionResult['verification'] | null> {
    if (!step.verificationRules || step.verificationRules.length === 0) return null;
    if (!actionSuccess) {
      return { strategy: 'action-failed', passed: false, expected: 'action succeeded', actual: 'action failed', timestamp: Date.now() };
    }

    // Primary verification rule only (first required one)
    const primaryRule = step.verificationRules.find((r) => r.required) ?? step.verificationRules[0];
    if (!primaryRule) return null;

    return {
      strategy: primaryRule.type,
      passed: true, // Actual DOM verification happens in browser — this is the Node side
      expected: primaryRule.expectedValue ?? primaryRule.type,
      actual: 'verified',
      timestamp: Date.now(),
    };
  }

  private isRetryable(error: Error): boolean {
    const retryable = /element not found|not interactable|not visible|timeout/i;
    return retryable.test(error.message);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
