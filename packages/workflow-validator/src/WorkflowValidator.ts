import type { CompiledWorkflow, ValidationReport } from '@humanhands/shared-types';
import { RULES } from './rules.js';

export interface ValidatorOptions {
  executionInputs?: Record<string, unknown>;
  rules?: string[];
}

export class WorkflowValidator {
  private readonly defaultRules = Object.keys(RULES);

  validate(workflow: CompiledWorkflow, options: ValidatorOptions = {}): ValidationReport {
    const rulesToRun = options.rules ?? this.defaultRules;
    const allIssues: ValidationReport['issues'] = [];

    for (const ruleId of rulesToRun) {
      const rule = RULES[ruleId];
      if (!rule) continue;
      try {
        const issues = rule(workflow, options.executionInputs);
        allIssues.push(...issues);
      } catch (err) {
        allIssues.push({
          code: 'RULE_ERROR',
          severity: 'warning',
          message: `Validation rule "${ruleId}" threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const errors = allIssues.filter((i) => i.severity === 'error');
    const warnings = allIssues.filter((i) => i.severity === 'warning');

    return {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      validatedAt: Date.now(),
      isValid: errors.length === 0,
      issues: allIssues,
      errorCount: errors.length,
      warningCount: warnings.length,
      checkedRules: rulesToRun,
      executionInputs: options.executionInputs,
    };
  }

  isExecutable(workflow: CompiledWorkflow, inputs: Record<string, unknown>): boolean {
    const report = this.validate(workflow, { executionInputs: inputs });
    return report.isValid;
  }
}
