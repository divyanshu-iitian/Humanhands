import type {
  CompiledWorkflow,
  ValidationIssue,
} from '@humanhands/shared-types';

type RuleCheck = (workflow: CompiledWorkflow, inputs?: Record<string, unknown>) => ValidationIssue[];

export const RULES: Record<string, RuleCheck> = {

  'schema-valid': (wf) => {
    const issues: ValidationIssue[] = [];
    if (!wf.id) issues.push({ code: 'NO_ID', severity: 'error', message: 'Workflow missing id' });
    if (!wf.name) issues.push({ code: 'NO_NAME', severity: 'error', message: 'Workflow missing name' });
    if (!wf.steps || wf.steps.length === 0) {
      issues.push({ code: 'NO_STEPS', severity: 'warning', message: 'Workflow has no steps' });
    }
    return issues;
  },

  'version-format-valid': (wf) => {
    if (!/^\d+\.\d+\.\d+$/.test(wf.version)) {
      return [{
        code: 'INVALID_VERSION',
        severity: 'error',
        message: `Version "${wf.version}" is not valid semver (expected X.Y.Z)`,
      }];
    }
    return [];
  },

  'selectors-valid': (wf) => {
    const issues: ValidationIssue[] = [];
    for (const step of wf.steps) {
      const target = step.action.target;
      if (!target) continue;
      if (target.kind === 'selector') {
        const sel = target.selector;
        if (!sel || sel.length < 1) {
          issues.push({
            code: 'EMPTY_SELECTOR',
            severity: 'error',
            message: `Step "${step.name}" has an empty selector`,
            stepId: step.id,
            selector: sel,
          });
        }
        // Check for obviously broken selectors
        if (sel && /\[data-hh-id=/.test(sel)) {
          issues.push({
            code: 'INTERNAL_SELECTOR',
            severity: 'warning',
            message: `Step "${step.name}" uses internal data-hh-id selector — may break across sessions`,
            stepId: step.id,
            selector: sel,
            suggestion: 'Use a stable selector: data-testid, aria-label, or id',
          });
        }
      }
    }
    return issues;
  },

  'variables-declared': (wf) => {
    const issues: ValidationIssue[] = [];
    const declared = new Set(wf.variables.map((v) => v.name));
    const PLACEHOLDER_RE = /\{\{([a-z][a-z0-9_]*)\}\}/g;

    for (const step of wf.steps) {
      const valuesToCheck = [step.action.value, step.action.url].filter(Boolean) as string[];
      for (const val of valuesToCheck) {
        let m;
        const re = new RegExp(PLACEHOLDER_RE.source, 'g');
        while ((m = re.exec(val)) !== null) {
          const name = m[1]!;
          if (!declared.has(name)) {
            issues.push({
              code: 'UNDECLARED_VARIABLE',
              severity: 'error',
              message: `Step "${step.name}" references undeclared variable {{${name}}}`,
              stepId: step.id,
              variableName: name,
              suggestion: `Add "${name}" to workflow variables`,
            });
          }
        }
      }
    }
    return issues;
  },

  'step-references-valid': (wf) => {
    const issues: ValidationIssue[] = [];
    const stepIds = new Set(wf.steps.map((s) => s.id));
    for (const step of wf.steps) {
      if (step.fallbackStepId && !stepIds.has(step.fallbackStepId)) {
        issues.push({
          code: 'INVALID_FALLBACK_REF',
          severity: 'error',
          message: `Step "${step.name}" references non-existent fallback step "${step.fallbackStepId}"`,
          stepId: step.id,
        });
      }
    }
    return issues;
  },

  'actions-supported': (wf) => {
    const SUPPORTED = new Set([
      'click', 'type', 'select', 'navigate', 'waitFor', 'extractText',
      'scroll', 'hover', 'focus', 'clear', 'submit', 'check', 'uncheck',
    ]);
    const issues: ValidationIssue[] = [];
    for (const step of wf.steps) {
      if (!SUPPORTED.has(step.action.type)) {
        issues.push({
          code: 'UNSUPPORTED_ACTION',
          severity: 'error',
          message: `Step "${step.name}" uses unsupported action type "${step.action.type}"`,
          stepId: step.id,
        });
      }
    }
    return issues;
  },

  'timeout-in-range': (wf) => {
    const issues: ValidationIssue[] = [];
    for (const step of wf.steps) {
      if (step.timeout < 500) {
        issues.push({
          code: 'TIMEOUT_TOO_LOW',
          severity: 'warning',
          message: `Step "${step.name}" timeout (${step.timeout}ms) is very low — may cause false failures`,
          stepId: step.id,
          suggestion: 'Set timeout >= 2000ms',
        });
      }
      if (step.timeout > 60000) {
        issues.push({
          code: 'TIMEOUT_TOO_HIGH',
          severity: 'warning',
          message: `Step "${step.name}" timeout (${step.timeout}ms) is very high`,
          stepId: step.id,
        });
      }
    }
    return issues;
  },

  'required-inputs-present': (wf, inputs) => {
    if (!inputs) return [];
    const issues: ValidationIssue[] = [];
    for (const variable of wf.variables) {
      if (variable.required && inputs[variable.name] === undefined) {
        issues.push({
          code: 'MISSING_INPUT',
          severity: 'error',
          message: `Required variable "${variable.name}" not provided`,
          variableName: variable.name,
        });
      }
    }
    return issues;
  },
};
