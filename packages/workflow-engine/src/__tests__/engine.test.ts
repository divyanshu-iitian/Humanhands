import { describe, it, expect, vi } from 'vitest';
import { VariableResolver } from '../VariableResolver.js';
import { ExecutionContext } from '../ExecutionContext.js';
import type { CompiledWorkflow } from '@humanhands/shared-types';

const resolver = new VariableResolver();

function makeWorkflow(overrides: Partial<CompiledWorkflow> = {}): CompiledWorkflow {
  const now = new Date().toISOString();
  return {
    id: 'wf_001',
    name: 'Test',
    version: '1.0.0',
    variables: [
      { name: 'customer_name', type: 'string', required: true, placeholder: '{{customer_name}}' },
      { name: 'email', type: 'email', required: true, placeholder: '{{email}}' },
      { name: 'amount', type: 'currency', required: false, placeholder: '{{amount}}', defaultValue: '0.00' },
    ],
    steps: [],
    metadata: { compiledAt: now, tags: [], usageCount: 0 },
    checksum: 'abc',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('VariableResolver', () => {
  it('resolves all required variables from inputs', () => {
    const wf = makeWorkflow();
    const inputs = { customer_name: 'Divyanshu', email: 'div@example.com' };
    const { resolved, missing, invalid } = resolver.resolve(wf, inputs);

    expect(missing).toHaveLength(0);
    expect(invalid).toHaveLength(0);
    expect(resolved['customer_name']).toBe('Divyanshu');
    expect(resolved['email']).toBe('div@example.com');
    expect(resolved['amount']).toBe('0.00'); // default
  });

  it('reports missing required variables', () => {
    const wf = makeWorkflow();
    const { missing } = resolver.resolve(wf, { customer_name: 'test' });
    expect(missing).toContain('email');
  });

  it('uses default value when optional variable not provided', () => {
    const wf = makeWorkflow();
    const { resolved } = resolver.resolve(wf, { customer_name: 'X', email: 'x@x.com' });
    expect(resolved['amount']).toBe('0.00');
  });

  it('interpolates template strings', () => {
    const result = resolver.interpolate(
      'Hello {{customer_name}}, your invoice is {{invoice_number}}',
      { customer_name: 'Divyanshu', invoice_number: 'INV-001' },
    );
    expect(result).toBe('Hello Divyanshu, your invoice is INV-001');
  });

  it('leaves unresolved placeholders intact', () => {
    const result = resolver.interpolate('Hello {{unknown}}', {});
    expect(result).toBe('Hello {{unknown}}');
  });

  it('extracts placeholder references from template', () => {
    const refs = resolver.extractReferences('{{first}} and {{second}} and {{first}}');
    expect(refs).toEqual(['first', 'second']);
  });
});

describe('ExecutionContext', () => {
  it('tracks step lifecycle', () => {
    const wf = makeWorkflow({
      steps: [{
        id: 'step_01', name: 'Test step',
        action: { id: 'a1', sessionId: 'x', type: 'click', createdAt: Date.now() },
        retries: 0, timeout: 5000, waitBefore: 0, waitAfter: 0,
        verificationRules: [], onFailure: 'abort', tags: [],
      }],
    });

    const ctx = new ExecutionContext(wf, 'session-1', 'production', {});
    ctx.start();
    ctx.markStepStarted(wf.steps[0]!);
    ctx.markStepCompleted('step_01', { status: 'success' });

    const result = ctx.toResult();
    expect(result.status).toBe('running'); // not yet called complete()
    expect(result.stepResults[0]?.status).toBe('success');

    ctx.complete();
    expect(ctx.toResult().status).toBe('completed');
  });

  it('marks failure correctly', () => {
    const wf = makeWorkflow({ steps: [] });
    const ctx = new ExecutionContext(wf, 'session-1', 'production', {});
    ctx.start();
    ctx.fail('Something went wrong');
    const result = ctx.toResult();
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Something went wrong');
  });

  it('computes execution summary', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', name: 'A', action: { id: 'a1', sessionId: 'x', type: 'click', createdAt: Date.now() }, retries: 0, timeout: 5000, waitBefore: 0, waitAfter: 0, verificationRules: [], onFailure: 'abort', tags: [] },
        { id: 's2', name: 'B', action: { id: 'a2', sessionId: 'x', type: 'type', createdAt: Date.now() }, retries: 0, timeout: 5000, waitBefore: 0, waitAfter: 0, verificationRules: [], onFailure: 'skip', tags: [] },
      ],
    });
    const ctx = new ExecutionContext(wf, 'session-1', 'production', {});
    ctx.start();
    ctx.markStepStarted(wf.steps[0]!);
    ctx.markStepCompleted('s1', { status: 'success' });
    ctx.markStepSkipped('s2', 'Condition not met');
    ctx.complete();

    const result = ctx.toResult();
    expect(result.summary.completed).toBe(1);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.failed).toBe(0);
  });
});
