import { describe, it, expect } from 'vitest';
import { WorkflowCompiler } from '../WorkflowCompiler.js';
import { NoiseReducer } from '../NoiseReducer.js';
import { StepNamer } from '../StepNamer.js';
import type { WorkflowRecording, RecordedAction } from '@humanhands/shared-types';

const compiler = new WorkflowCompiler();
const noiseReducer = new NoiseReducer();
const stepNamer = new StepNamer();

function makeAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    id: crypto.randomUUID(),
    sessionId: 'test-session',
    recordingId: 'rec-001',
    sequenceNumber: 0,
    timestamp: Date.now(),
    actionType: 'click',
    pageContext: {
      url: 'https://app.example.com/invoices',
      title: 'Invoices',
      graphChecksum: 'abc123',
      isModal: false,
      loadState: 'complete',
      timestamp: Date.now(),
    },
    executionMeta: {
      succeeded: true,
      retryCount: 0,
      isNavigation: false,
      triggeredBy: 'user',
    },
    ...overrides,
  };
}

function makeRecording(actions: RecordedAction[]): WorkflowRecording {
  return {
    id: 'rec-001',
    name: 'Test Recording',
    sessionId: 'test-session',
    status: 'completed',
    startedAt: Date.now() - 10000,
    endedAt: Date.now(),
    actions,
    pageHistory: ['https://app.example.com/invoices'],
    startUrl: 'https://app.example.com/invoices',
    metadata: {},
    tags: [],
  };
}

describe('NoiseReducer', () => {
  it('removes failed actions', () => {
    const actions = [
      makeAction({ executionMeta: { succeeded: false, retryCount: 1, isNavigation: false, triggeredBy: 'user' } }),
      makeAction({ actionType: 'click' }),
    ];
    const { actions: cleaned } = noiseReducer.reduce(actions);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.actionType).toBe('click');
  });

  it('collapses double-clicks on same element', () => {
    const now = Date.now();
    const target = { elementId: 'el1', selector: { primary: '#btn', fallbacks: [] }, text: 'Click', role: 'button' as const, tagName: 'button', accessibility: { focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 100, height: 40, top: 0, right: 100, bottom: 40, left: 0 } };
    const actions = [
      makeAction({ actionType: 'click', timestamp: now, target }),
      makeAction({ actionType: 'click', timestamp: now + 200, target }),
    ];
    const { actions: cleaned } = noiseReducer.reduce(actions);
    expect(cleaned).toHaveLength(1);
  });

  it('collapses type sequences to final value', () => {
    const target = { elementId: 'input1', selector: { primary: 'input[name="email"]', fallbacks: [] }, text: '', role: 'input' as const, tagName: 'input', accessibility: { focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 200, height: 48, top: 0, right: 200, bottom: 48, left: 0 } };
    const actions = [
      makeAction({ actionType: 'type', target, value: 'wrong@email.com' }),
      makeAction({ actionType: 'type', target, value: 'correct@email.com' }),
    ];
    const { actions: cleaned } = noiseReducer.reduce(actions);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.value).toBe('correct@email.com');
  });
});

describe('StepNamer', () => {
  it('names click on button', () => {
    const action = makeAction({
      actionType: 'click',
      target: { elementId: 'btn', selector: { primary: '#submit', fallbacks: [] }, text: 'Submit Invoice', role: 'button', tagName: 'button', accessibility: { focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 100, height: 40, top: 0, right: 100, bottom: 40, left: 0 } },
    });
    expect(stepNamer.name(action)).toBe('Click "Submit Invoice"');
  });

  it('names type action with aria label', () => {
    const action = makeAction({
      actionType: 'type',
      value: 'test@example.com',
      target: { elementId: 'email', selector: { primary: '#email', fallbacks: [] }, text: '', role: 'input', tagName: 'input', accessibility: { ariaLabel: 'Email address', focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 300, height: 48, top: 0, right: 300, bottom: 48, left: 0 } },
    });
    expect(stepNamer.name(action)).toBe('Type in "Email address" field');
  });

  it('names navigate action', () => {
    const action = makeAction({ actionType: 'navigate', url: 'https://app.example.com/invoices/new' });
    expect(stepNamer.name(action)).toBe('Navigate to /invoices/new');
  });
});

describe('WorkflowCompiler', () => {
  it('compiles a simple recording', () => {
    const actions = [
      makeAction({ actionType: 'navigate', url: 'https://app.example.com/invoices' }),
      makeAction({
        actionType: 'click',
        target: { elementId: 'btn-create', selector: { primary: '[data-testid="create-invoice"]', fallbacks: [] }, text: 'Create Invoice', role: 'button', tagName: 'button', accessibility: { focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 140, height: 48, top: 0, right: 140, bottom: 48, left: 0 } },
      }),
      makeAction({
        actionType: 'type',
        value: 'Divyanshu Mishra',
        target: { elementId: 'customer', selector: { primary: 'input[name="customer"]', fallbacks: [] }, text: '', role: 'input', tagName: 'input', accessibility: { ariaLabel: 'Customer Name', focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 300, height: 48, top: 0, right: 300, bottom: 48, left: 0 } },
      }),
      makeAction({
        actionType: 'type',
        value: 'user@example.com',
        target: { elementId: 'email', selector: { primary: 'input[type="email"]', fallbacks: [] }, text: '', role: 'input', tagName: 'input', accessibility: { ariaLabel: 'Email', focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 300, height: 48, top: 0, right: 300, bottom: 48, left: 0 } },
      }),
    ];

    const recording = makeRecording(actions);
    const { workflow, stats } = compiler.compile(recording);

    expect(workflow.id).toBeTruthy();
    expect(workflow.version).toBe('1.0.0');
    expect(workflow.steps.length).toBeGreaterThan(0);
    expect(stats.rawActionCount).toBe(4);
    expect(workflow.checksum).toBeTruthy();

    // Variables should be detected for multi-word string and email
    expect(workflow.variables.length).toBeGreaterThanOrEqual(1);

    const emailVar = workflow.variables.find((v) => v.type === 'email');
    expect(emailVar).toBeTruthy();
  });

  it('substitutes detected variables in step values', () => {
    const actions = [
      makeAction({
        actionType: 'type',
        value: 'INV-2026-001',
        target: { elementId: 'inv-num', selector: { primary: '#invoice-number', fallbacks: [] }, text: '', role: 'input', tagName: 'input', accessibility: { ariaLabel: 'Invoice Number', focusable: true, keyboardAccessible: true }, currentValue: undefined, bounds: { x: 0, y: 0, width: 200, height: 48, top: 0, right: 200, bottom: 48, left: 0 } },
      }),
    ];

    const { workflow } = compiler.compile(makeRecording(actions));
    const typeStep = workflow.steps.find((s) => s.action.type === 'type');

    // The value should be substituted with {{invoice_number}} or similar
    expect(typeStep?.action.value).toMatch(/^\{\{.+\}\}$/);
  });

  it('generates a valid checksum', () => {
    const recording = makeRecording([makeAction()]);
    const { workflow } = compiler.compile(recording);
    expect(workflow.checksum).toMatch(/^[a-f0-9]{16}$/);
  });
});
