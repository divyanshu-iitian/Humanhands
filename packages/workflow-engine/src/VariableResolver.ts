import type { CompiledWorkflow, WorkflowVariable } from '@humanhands/shared-types';

export interface VariableResolutionResult {
  resolved: Record<string, unknown>;
  missing: string[];
  invalid: Array<{ name: string; reason: string }>;
}

const PLACEHOLDER_RE = /\{\{([a-z][a-z0-9_]*)\}\}/g;

/**
 * Resolves workflow variable placeholders to actual values.
 *
 * Templates use Mustache-style syntax: {{variable_name}}
 * Nested interpolation not supported (YAGNI).
 */
export class VariableResolver {
  resolve(
    workflow: CompiledWorkflow,
    inputs: Record<string, unknown>,
  ): VariableResolutionResult {
    const resolved: Record<string, unknown> = {};
    const missing: string[] = [];
    const invalid: Array<{ name: string; reason: string }> = [];

    for (const variable of workflow.variables) {
      const inputValue = inputs[variable.name];

      if (inputValue !== undefined && inputValue !== null && inputValue !== '') {
        const validationError = this.validateValue(variable, inputValue);
        if (validationError) {
          invalid.push({ name: variable.name, reason: validationError });
        }
        resolved[variable.name] = inputValue;
      } else if (variable.defaultValue !== undefined) {
        resolved[variable.name] = variable.defaultValue;
      } else if (variable.required) {
        missing.push(variable.name);
      }
    }

    return { resolved, missing, invalid };
  }

  /**
   * Substitute {{variable_name}} in a string template.
   */
  interpolate(template: string, variables: Record<string, unknown>): string {
    return template.replace(PLACEHOLDER_RE, (match, name: string) => {
      const value = variables[name];
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Extract all {{variable_name}} references in a template string.
   */
  extractReferences(template: string): string[] {
    const refs: string[] = [];
    const regex = new RegExp(PLACEHOLDER_RE.source, 'g');
    let m;
    while ((m = regex.exec(template)) !== null) {
      const name = m[1];
      if (name && !refs.includes(name)) refs.push(name);
    }
    return refs;
  }

  private validateValue(variable: WorkflowVariable, value: unknown): string | null {
    const v = variable.validation;
    if (!v) return null;
    const str = String(value);

    if (v.pattern) {
      try {
        if (!new RegExp(v.pattern).test(str)) {
          return `Does not match pattern ${v.pattern}`;
        }
      } catch {
        // invalid pattern — skip
      }
    }

    if (v.minLength !== undefined && str.length < v.minLength) {
      return `Too short (min ${v.minLength} chars)`;
    }
    if (v.maxLength !== undefined && str.length > v.maxLength) {
      return `Too long (max ${v.maxLength} chars)`;
    }
    if (variable.type === 'number' || variable.type === 'currency') {
      const num = parseFloat(str.replace(/[$,]/g, ''));
      if (isNaN(num)) return 'Not a valid number';
      if (v.min !== undefined && num < v.min) return `Less than minimum ${v.min}`;
      if (v.max !== undefined && num > v.max) return `Greater than maximum ${v.max}`;
    }
    if (v.enum && !v.enum.includes(str)) {
      return `Must be one of: ${v.enum.join(', ')}`;
    }

    return null;
  }
}
