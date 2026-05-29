import { describe, it, expect } from 'vitest';
import { WorkflowValidator } from '../WorkflowValidator.js';
import type { CompiledWorkflow } from '@humanhands/shared-types';

const validator = new WorkflowValidator();

function makeWorkflow(overrides: Partial<CompiledWorkflow> = {}): CompiledWorkflow {
  const now = new Date().toISOString();
  return {
    id: 'wf_test_001',
    name: 'Test Workflow',
    version: '1.0.0',
    variables: [],
    steps: [
      {
        id: 'step_01',
        name: 'Click submit',
        action: {
          id: 'step_01_action',
          sessionId: 'test',
          type: 'click',
          target: { kind: 'selector', selector: '[data-testid="submit"]', fallbackSelectors: ['button[type="submit"]'] },
          createdAt: Date.now(),
        },
        retries: 2,
        timeout: 5000,
        waitBefore: 0,
        waitAfter: 0,
        verificationRules: [],
        onFailure: 'abort',
        tags: [],
      },
    ],
    metadata: {
      compiledAt: now,
      tags: [],
      usageCount: 0,
    },
    checksum: 'abc123',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('WorkflowValidator', () => {
  describe('schema validation', () => {
    it('passes valid workflow', () => {
      const report = validator.validate(makeWorkflow());
      expect(report.isValid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it('fails workflow without steps', () => {
      const report = validator.validate(makeWorkflow({ steps: [] }));
      expect(report.warningCount).toBeGreaterThan(0);
    });
  });

  describe('version validation', () => {
    it('fails invalid version format', () => {
      const report = validator.validate(makeWorkflow({ version: '1.0' }));
      expect(report.isValid).toBe(false);
      expect(report.issues.some((i) => i.code === 'INVALID_VERSION')).toBe(true);
    });

    it('passes valid semver', () => {
      const report = validator.validate(makeWorkflow({ version: '2.1.3' }));
      expect(report.issues.filter((i) => i.code === 'INVALID_VERSION')).toHaveLength(0);
    });
  });

  describe('selector validation', () => {
    it('warns on internal data-hh-id selectors', () => {
      const wf = makeWorkflow();
      const step = wf.steps[0]!;
      step.action.target = { kind: 'selector', selector: '[data-hh-id="button_abc"]', fallbackSelectors: [] };

      const report = validator.validate(wf);
      expect(report.issues.some((i) => i.code === 'INTERNAL_SELECTOR')).toBe(true);
    });

    it('passes stable selectors', () => {
      const report = validator.validate(makeWorkflow());
      const selectorIssues = report.issues.filter((i) =>
        ['EMPTY_SELECTOR', 'INTERNAL_SELECTOR'].includes(i.code),
      );
      expect(selectorIssues).toHaveLength(0);
    });
  });

  describe('variable declaration', () => {
    it('errors on undeclared variable reference', () => {
      const wf = makeWorkflow();
      wf.steps[0]!.action.value = '{{customer_name}}';

      const report = validator.validate(wf);
      expect(report.isValid).toBe(false);
      expect(report.issues.some((i) => i.code === 'UNDECLARED_VARIABLE')).toBe(true);
    });

    it('passes when variable is declared', () => {
      const wf = makeWorkflow({
        variables: [{
          name: 'customer_name',
          type: 'string',
          required: true,
          placeholder: '{{customer_name}}',
        }],
      });
      wf.steps[0]!.action.value = '{{customer_name}}';

      const report = validator.validate(wf);
      expect(report.issues.some((i) => i.code === 'UNDECLARED_VARIABLE')).toBe(false);
    });
  });

  describe('required inputs check', () => {
    it('reports missing required variables at execution time', () => {
      const wf = makeWorkflow({
        variables: [{ name: 'invoice_number', type: 'invoice-number', required: true, placeholder: '{{invoice_number}}' }],
      });
      const report = validator.validate(wf, { executionInputs: {} });
      expect(report.issues.some((i) => i.code === 'MISSING_INPUT')).toBe(true);
    });

    it('passes when all required inputs provided', () => {
      const wf = makeWorkflow({
        variables: [{ name: 'invoice_number', type: 'invoice-number', required: true, placeholder: '{{invoice_number}}' }],
      });
      const report = validator.validate(wf, { executionInputs: { invoice_number: 'INV-001' } });
      expect(report.issues.some((i) => i.code === 'MISSING_INPUT')).toBe(false);
    });
  });

  describe('timeout range', () => {
    it('warns on very low timeout', () => {
      const wf = makeWorkflow();
      wf.steps[0]!.timeout = 100;
      const report = validator.validate(wf);
      expect(report.issues.some((i) => i.code === 'TIMEOUT_TOO_LOW')).toBe(true);
    });
  });

  describe('isExecutable', () => {
    it('returns true for valid workflow with all inputs', () => {
      const wf = makeWorkflow({
        variables: [{ name: 'email', type: 'email', required: true, placeholder: '{{email}}' }],
      });
      wf.steps[0]!.action.value = '{{email}}';
      expect(validator.isExecutable(wf, { email: 'test@example.com' })).toBe(true);
    });
  });
});
