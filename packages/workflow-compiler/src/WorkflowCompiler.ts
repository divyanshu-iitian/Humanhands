import { randomUUID, createHash } from 'crypto';
import type {
  WorkflowRecording,
  RecordedAction,
  CompiledWorkflow,
  CompiledStep,
  ActionRequest,
  ActionTarget,
} from '@humanhands/shared-types';
import { VariableExtractor } from '@humanhands/variable-engine';
import { NoiseReducer } from './NoiseReducer.js';
import { StepNamer } from './StepNamer.js';
import { VerificationBuilder } from './VerificationBuilder.js';

export interface CompilationResult {
  workflow: CompiledWorkflow;
  stats: {
    rawActionCount: number;
    compiledStepCount: number;
    removedNoiseCount: number;
    detectedVariables: number;
    estimatedDurationMs: number;
  };
  warnings: string[];
}

export interface CompilerOptions {
  name?: string;
  description?: string;
  version?: string;
  includeWaits?: boolean;
  defaultRetries?: number;
  defaultTimeout?: number;
}

/**
 * Converts a raw WorkflowRecording into a clean, deterministic CompiledWorkflow.
 *
 * Pipeline:
 * 1. Noise reduction (remove failed/duplicate/irrelevant actions)
 * 2. Variable extraction (detect and substitute dynamic values)
 * 3. Step compilation (convert each action to a typed CompiledStep)
 * 4. Verification injection (add verification rules based on post-state)
 * 5. Wait optimization (replace excessive delays with semantic waitFors)
 * 6. Metadata generation
 */
export class WorkflowCompiler {
  private readonly noiseReducer = new NoiseReducer();
  private readonly stepNamer = new StepNamer();
  private readonly verificationBuilder = new VerificationBuilder();
  private readonly variableExtractor = new VariableExtractor();

  compile(recording: WorkflowRecording, options: CompilerOptions = {}): CompilationResult {
    const warnings: string[] = [];

    if (recording.actions.length === 0) {
      warnings.push('Recording contains no actions');
    }

    // ── Step 1: Noise reduction ───────────────────────────────────────────
    const { actions: cleaned, removedCount, removedReasons } = this.noiseReducer.reduce(recording.actions);
    if (removedCount > 0) {
      warnings.push(...removedReasons.slice(0, 5));
    }

    // ── Step 2: Variable detection ────────────────────────────────────────
    const detectedVars = this.variableExtractor.extractFromRecording({
      ...recording,
      actions: cleaned,
    });

    // ── Step 3: Compile steps ─────────────────────────────────────────────
    const rawSteps = cleaned.map((action, idx) =>
      this.compileStep(action, idx, detectedVars),
    );

    // ── Step 4: Apply variable substitution ───────────────────────────────
    const { steps: finalSteps, workflowVariables } = this.variableExtractor.applyToSteps(
      rawSteps,
      detectedVars,
    );

    // ── Step 5: Wait optimization ─────────────────────────────────────────
    const optimizedSteps = options.includeWaits !== false
      ? this.optimizeWaits(finalSteps, cleaned)
      : finalSteps;

    // ── Step 6: Build workflow ────────────────────────────────────────────
    const name = options.name ?? recording.name;
    const now = new Date().toISOString();
    const estimatedDuration = this.estimateDuration(cleaned);

    const workflow: CompiledWorkflow = {
      id: `wf_${randomUUID().slice(0, 8)}`,
      name,
      description: options.description ?? recording.description,
      version: options.version ?? '1.0.0',
      variables: workflowVariables,
      steps: optimizedSteps,
      metadata: {
        recordingId: recording.id,
        compiledAt: now,
        targetDomain: this.extractDomain(recording.startUrl),
        estimatedDurationMs: estimatedDuration,
        tags: recording.tags,
        usageCount: 0,
      },
      checksum: '',
      createdAt: now,
      updatedAt: now,
    };

    workflow.checksum = this.computeChecksum(workflow);

    return {
      workflow,
      stats: {
        rawActionCount: recording.actions.length,
        compiledStepCount: optimizedSteps.length,
        removedNoiseCount: removedCount,
        detectedVariables: detectedVars.size,
        estimatedDurationMs: estimatedDuration,
      },
      warnings,
    };
  }

  private compileStep(
    action: RecordedAction,
    index: number,
    _variables: Map<string, import('@humanhands/shared-types').DetectedVariable>,
  ): CompiledStep {
    const stepId = `step_${String(index + 1).padStart(2, '0')}`;
    const name = this.stepNamer.name(action);
    const description = this.stepNamer.describe(action);
    const verificationRules = this.verificationBuilder.build(action);
    const target = action.target;
    const actionRequest = this.buildActionRequest(action, stepId);
    const isNavigation = action.actionType === 'navigate' || action.executionMeta.isNavigation;

    return {
      id: stepId,
      name,
      description,
      action: actionRequest,
      retries: 2,
      timeout: isNavigation ? 20000 : 10000,
      waitBefore: 0,
      waitAfter: isNavigation ? 500 : 0,
      verificationRules,
      onFailure: 'abort',
      tags: [action.actionType, ...(target?.role ? [target.role] : [])],
      sourceRecordingId: action.recordingId,
      recordedAt: action.timestamp,
    };
  }

  private buildActionRequest(action: RecordedAction, stepId: string): ActionRequest {
    const target = action.target;
    let actionTarget: ActionTarget | undefined;

    if (target) {
      actionTarget = {
        kind: 'selector',
        selector: target.selector.primary,
        fallbackSelectors: [
          ...(target.selector.fallbacks ?? []),
          ...(target.selector.semantic ? [target.selector.semantic] : []),
          ...(target.accessibility.ariaLabel
            ? [`[aria-label="${target.accessibility.ariaLabel}"]`]
            : []),
          ...(target.accessibility.ariaRole && target.text
            ? [`[role="${target.accessibility.ariaRole}"]:has-text("${target.text.slice(0, 40)}")`]
            : []),
        ].filter((v, i, arr) => v && arr.indexOf(v) === i),
      };
    }

    return {
      id: `${stepId}_action`,
      sessionId: action.sessionId,
      type: action.actionType as ActionRequest['type'],
      target: actionTarget,
      value: action.value,
      url: action.url,
      createdAt: action.timestamp,
      options: action.options ?? undefined,
    };
  }

  private optimizeWaits(steps: CompiledStep[], actions: RecordedAction[]): CompiledStep[] {
    return steps.map((step, idx) => {
      const action = actions[idx];
      if (!action) return step;

      const nextAction = actions[idx + 1];
      if (!nextAction) return step;

      const gapMs = nextAction.timestamp - action.timestamp;

      if (gapMs > 3000 && gapMs < 60000) {
        return {
          ...step,
          waitAfter: Math.min(gapMs, 2000),
        };
      }

      return step;
    });
  }

  private estimateDuration(actions: RecordedAction[]): number {
    if (actions.length < 2) return 0;
    const first = actions[0]!;
    const last = actions[actions.length - 1]!;
    return last.timestamp - first.timestamp;
  }

  private extractDomain(url: string): string | undefined {
    try {
      return new URL(url).hostname;
    } catch {
      return undefined;
    }
  }

  private computeChecksum(workflow: Omit<CompiledWorkflow, 'checksum'>): string {
    const fingerprint = JSON.stringify({
      steps: workflow.steps.map((s) => ({
        id: s.id,
        type: s.action.type,
        target: s.action.target,
        value: s.action.value,
      })),
      variables: workflow.variables.map((v) => v.name),
    });
    return createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);
  }
}
