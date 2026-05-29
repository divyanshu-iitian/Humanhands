import type {
  CompiledWorkflow,
  WorkflowExecutionResult,
  StepExecutionResult,
  ExecutionMode,
} from '@humanhands/shared-types';
import { WorkflowValidator } from '@humanhands/workflow-validator';

export interface SimulationStep {
  stepId: string;
  stepName: string;
  actionType: string;
  resolvedTarget: string;
  resolvedValue: string | undefined;
  verificationRules: string[];
  estimatedDurationMs: number;
  canSkip: boolean;
  selectorRisk: 'low' | 'medium' | 'high';
  warnings: string[];
}

export interface SimulationReport {
  workflowId: string;
  workflowVersion: string;
  mode: ExecutionMode;
  isSimulatable: boolean;
  validationReport: ReturnType<WorkflowValidator['validate']>;
  steps: SimulationStep[];
  totalEstimatedDurationMs: number;
  selectorRisks: { high: number; medium: number; low: number };
  warnings: string[];
}

/**
 * Simulates workflow execution without any real browser interaction.
 *
 * Provides:
 * - Step-by-step trace with resolved variables
 * - Selector risk assessment
 * - Timing estimates
 * - Validation feedback
 *
 * Use for CI, debugging, and pre-flight checks.
 */
export class WorkflowSimulator {
  private readonly validator = new WorkflowValidator();

  simulate(
    workflow: CompiledWorkflow,
    inputs: Record<string, unknown> = {},
  ): SimulationReport {
    const validationReport = this.validator.validate(workflow, { executionInputs: inputs });

    const simulatedSteps = workflow.steps.map((step) =>
      this.simulateStep(step, inputs),
    );

    const totalDuration = simulatedSteps.reduce((sum, s) => sum + s.estimatedDurationMs, 0);
    const risks = {
      high: simulatedSteps.filter((s) => s.selectorRisk === 'high').length,
      medium: simulatedSteps.filter((s) => s.selectorRisk === 'medium').length,
      low: simulatedSteps.filter((s) => s.selectorRisk === 'low').length,
    };

    const warnings = [
      ...validationReport.issues
        .filter((i) => i.severity === 'warning')
        .map((i) => i.message),
      ...simulatedSteps.flatMap((s) => s.warnings),
    ];

    return {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      mode: 'dry-run',
      isSimulatable: validationReport.isValid,
      validationReport,
      steps: simulatedSteps,
      totalEstimatedDurationMs: totalDuration,
      selectorRisks: risks,
      warnings,
    };
  }

  /**
   * Run through the simulation and produce a synthetic WorkflowExecutionResult
   * with dry-run step statuses — useful for testing workflow logic.
   */
  async dryRun(
    workflow: CompiledWorkflow,
    inputs: Record<string, unknown> = {},
  ): Promise<WorkflowExecutionResult> {
    const report = this.simulate(workflow, inputs);
    const stepResults: StepExecutionResult[] = report.steps.map((step) => ({
      stepId: step.stepId,
      stepName: step.stepName,
      status: 'success' as const,
      startedAt: Date.now(),
      completedAt: Date.now() + step.estimatedDurationMs,
      duration: step.estimatedDurationMs,
      retryCount: 0,
      resolvedValue: step.resolvedValue,
    }));

    return {
      executionId: `sim_${Date.now().toString(36)}`,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      sessionId: 'simulation',
      mode: 'dry-run',
      status: report.isSimulatable ? 'completed' : 'failed',
      startedAt: Date.now(),
      completedAt: Date.now() + report.totalEstimatedDurationMs,
      totalDuration: report.totalEstimatedDurationMs,
      resolvedVariables: inputs,
      stepResults,
      error: report.isSimulatable ? undefined : 'Validation failed — see validationReport',
      summary: {
        totalSteps: stepResults.length,
        completed: report.isSimulatable ? stepResults.length : 0,
        failed: report.isSimulatable ? 0 : 1,
        skipped: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
      },
    };
  }

  private simulateStep(
    step: import('@humanhands/shared-types').CompiledStep,
    inputs: Record<string, unknown>,
  ): SimulationStep {
    const warnings: string[] = [];
    const target = step.action.target;
    const resolvedTarget = target?.kind === 'selector' ? target.selector : target?.kind ?? '';
    const resolvedValue = step.action.value
      ? step.action.value.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, name: string) => {
          return inputs[name] !== undefined ? String(inputs[name]) : `{{${name}}}`;
        })
      : undefined;

    // Selector risk assessment
    let selectorRisk: SimulationStep['selectorRisk'] = 'low';
    if (target?.kind === 'selector') {
      const sel = target.selector;
      if (/data-hh-id=/.test(sel)) { selectorRisk = 'high'; warnings.push('Uses internal data-hh-id selector'); }
      else if (/nth-child|nth-of-type/.test(sel)) { selectorRisk = 'medium'; warnings.push('Positional selector may break'); }
      else if (/data-testid|aria-label|name=/.test(sel)) selectorRisk = 'low';
      else if (target.fallbackSelectors && target.fallbackSelectors.length > 1) selectorRisk = 'low';
      else selectorRisk = 'medium';
    }

    // Estimate duration based on action type
    const durationMap: Record<string, number> = {
      navigate: 2000, click: 500, type: 800, select: 400,
      waitFor: step.timeout / 2, extractText: 200, scroll: 300, hover: 200,
    };
    const estimatedDurationMs = (durationMap[step.action.type] ?? 500) + step.waitBefore + step.waitAfter;

    return {
      stepId: step.id,
      stepName: step.name,
      actionType: step.action.type,
      resolvedTarget,
      resolvedValue,
      verificationRules: step.verificationRules.map((r) => r.type),
      estimatedDurationMs,
      canSkip: step.onFailure === 'skip',
      selectorRisk,
      warnings,
    };
  }
}
