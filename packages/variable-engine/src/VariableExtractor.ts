import type {
  CompiledWorkflow,
  CompiledStep,
  WorkflowVariable,
  RecordedAction,
  WorkflowRecording,
  DetectedVariable,
} from '@humanhands/shared-types';
import { VariableDetector, type DetectionInput } from './VariableDetector.js';

/**
 * Extracts and substitutes variables throughout a compiled workflow.
 * Called by the WorkflowCompiler after initial compilation.
 */
export class VariableExtractor {
  private readonly detector = new VariableDetector();

  /**
   * Scan all type/select actions in a recording and extract detected variables.
   */
  extractFromRecording(recording: WorkflowRecording): Map<string, DetectedVariable> {
    const inputs: DetectionInput[] = [];

    for (const action of recording.actions) {
      if (
        (action.actionType === 'type' || action.actionType === 'select') &&
        action.value &&
        action.executionMeta.succeeded
      ) {
        inputs.push({
          value: action.value,
          fieldLabel: action.target?.accessibility.ariaLabel,
          fieldName: action.target?.attributes?.['name'],
          fieldType: action.target?.inputType,
          placeholder: action.target?.attributes?.['placeholder'],
          contextUrl: action.pageContext.url,
        });
      }
    }

    return this.detector.detectBatch(inputs);
  }

  /**
   * Apply detected variables to workflow steps — replace literal values with {{placeholders}}.
   */
  applyToSteps(
    steps: CompiledStep[],
    variables: Map<string, DetectedVariable>,
  ): { steps: CompiledStep[]; workflowVariables: WorkflowVariable[] } {
    const substituted = steps.map((step) => this.substituteStep(step, variables));
    const workflowVariables = this.toWorkflowVariables(variables);
    return { steps: substituted, workflowVariables };
  }

  /**
   * Resolve {{variable_name}} placeholders in an action value using the provided inputs.
   * Called at workflow execution time.
   */
  resolveValue(template: string, inputs: Record<string, unknown>): string {
    return template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, name: string) => {
      const val = inputs[name];
      return val !== undefined ? String(val) : `{{${name}}}`;
    });
  }

  /**
   * Extract all {{variable_name}} references from a template string.
   */
  extractPlaceholders(template: string): string[] {
    const matches = template.match(/\{\{([a-z][a-z0-9_]*)\}\}/g) ?? [];
    return matches.map((m) => m.slice(2, -2));
  }

  private substituteStep(step: CompiledStep, variables: Map<string, DetectedVariable>): CompiledStep {
    if (!step.action.value) return step;

    const substituted = this.detector.substitute(step.action.value, variables);
    if (substituted === step.action.value) return step;

    return {
      ...step,
      action: { ...step.action, value: substituted },
    };
  }

  private toWorkflowVariables(variables: Map<string, DetectedVariable>): WorkflowVariable[] {
    return Array.from(variables.values()).map((detected) => ({
      name: detected.name,
      type: detected.type,
      required: true,
      description: detected.description,
      placeholder: detected.placeholder,
      sampleValue: detected.sampleValue,
      validation: detected.validation,
      sourceField: detected.sourceField,
    }));
  }
}
