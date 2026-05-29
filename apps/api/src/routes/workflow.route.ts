import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WorkflowCompiler } from '@humanhands/workflow-compiler';
import { WorkflowValidator } from '@humanhands/workflow-validator';
import { WorkflowEngine } from '@humanhands/workflow-engine';
import { WorkflowRepository } from '@humanhands/workflow-repository';
import { WorkflowSimulator } from '@humanhands/workflow-simulator';
import type { CompiledWorkflow, WorkflowRecording } from '@humanhands/shared-types';
import type { Executor } from '@humanhands/executor';
import type { EventBus } from '@humanhands/event-system';

const compiler = new WorkflowCompiler();
const validator = new WorkflowValidator();
const repository = new WorkflowRepository();
const simulator = new WorkflowSimulator();

export async function workflowRoutes(
  app: FastifyInstance,
  executor: Executor,
  eventBus: EventBus,
): Promise<void> {
  const engine = new WorkflowEngine({ executor, eventBus });

  // ── POST /workflow/compile ──────────────────────────────────────────────

  app.post<{ Body: { recording: WorkflowRecording; options?: Record<string, unknown> } }>(
    '/workflow/compile',
    {
      schema: {
        description: 'Compile a raw WorkflowRecording into a deterministic CompiledWorkflow',
        tags: ['workflow'],
      },
    },
    async (req, reply) => {
      const { recording, options = {} } = req.body;
      if (!recording) return reply.code(400).send({ error: 'recording is required' });

      try {
        const result = compiler.compile(recording, options);
        repository.saveRecording(recording);
        const saved = repository.saveWorkflow(result.workflow, 'Initial compilation');

        return reply.code(201).send({
          success: true,
          workflow: saved,
          stats: result.stats,
          warnings: result.warnings,
        });
      } catch (err) {
        return reply.code(422).send({ error: 'COMPILATION_FAILED', message: String(err) });
      }
    },
  );

  // ── POST /workflow/create ────────────────────────────────────────────────

  app.post<{ Body: CompiledWorkflow }>(
    '/workflow/create',
    { schema: { description: 'Persist a hand-authored CompiledWorkflow', tags: ['workflow'] } },
    async (req, reply) => {
      const workflow = req.body;
      if (!workflow?.id) return reply.code(400).send({ error: 'workflow.id is required' });

      const report = validator.validate(workflow);
      if (!report.isValid) {
        return reply.code(422).send({ error: 'VALIDATION_FAILED', report });
      }

      const saved = repository.saveWorkflow(workflow, 'Manual creation');
      return reply.code(201).send({ success: true, workflow: saved });
    },
  );

  // ── POST /workflow/validate ──────────────────────────────────────────────

  app.post<{ Body: { workflow: CompiledWorkflow; inputs?: Record<string, unknown> } }>(
    '/workflow/validate',
    { schema: { description: 'Validate a workflow and optionally check input variables', tags: ['workflow'] } },
    async (req, reply) => {
      const { workflow, inputs } = req.body;
      if (!workflow) return reply.code(400).send({ error: 'workflow is required' });

      const report = validator.validate(workflow, { executionInputs: inputs });
      return reply.code(200).send({ success: true, report, isValid: report.isValid });
    },
  );

  // ── POST /workflow/simulate ──────────────────────────────────────────────

  app.post<{ Body: { workflowId: string; inputs?: Record<string, unknown> } }>(
    '/workflow/simulate',
    { schema: { description: 'Dry-run a workflow without executing browser actions', tags: ['workflow'] } },
    async (req, reply) => {
      const { workflowId, inputs = {} } = req.body;
      const workflow = repository.getWorkflow(workflowId);
      if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });

      const report = simulator.simulate(workflow, inputs);
      const dryRunResult = await simulator.dryRun(workflow, inputs);
      return reply.code(200).send({ success: true, simulationReport: report, dryRunResult });
    },
  );

  // ── POST /workflow/execute ───────────────────────────────────────────────

  app.post<{
    Body: {
      workflowId: string;
      sessionId: string;
      inputs?: Record<string, unknown>;
      mode?: 'production' | 'validation' | 'dry-run';
    };
  }>(
    '/workflow/execute',
    { schema: { description: 'Execute a workflow against a live browser session', tags: ['workflow'] } },
    async (req, reply) => {
      const { workflowId, sessionId, inputs = {}, mode = 'production' } = req.body;
      const workflow = repository.getWorkflow(workflowId);
      if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });

      const validReport = validator.validate(workflow, { executionInputs: inputs });
      if (!validReport.isValid) {
        return reply.code(422).send({ error: 'VALIDATION_FAILED', report: validReport });
      }

      try {
        const result = await engine.run(workflow, { sessionId, mode, inputs });
        repository.saveExecution(result);

        const statusCode = result.status === 'completed' ? 200 : 422;
        return reply.code(statusCode).send({ success: result.status === 'completed', result });
      } catch (err) {
        return reply.code(500).send({ error: 'EXECUTION_FAILED', message: String(err) });
      }
    },
  );

  // ── GET /workflow/:id ────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    '/workflow/:id',
    { schema: { description: 'Get a workflow definition by ID', tags: ['workflow'] } },
    async (req, reply) => {
      const workflow = repository.getWorkflow(req.params.id);
      if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });
      return reply.code(200).send({ success: true, workflow });
    },
  );

  // ── GET /workflow/:id/history ────────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    '/workflow/:id/history',
    { schema: { description: 'Get execution history for a workflow', tags: ['workflow'] } },
    async (req, reply) => {
      const executions = repository.getExecutionHistory(req.params.id);
      const versions = repository.getVersionHistory(req.params.id);
      return reply.code(200).send({
        success: true,
        executions,
        versions: versions.map((v) => ({
          version: v.version,
          createdAt: v.createdAt,
          isCurrent: v.isCurrent,
          changelog: v.changelog,
        })),
      });
    },
  );

  // ── GET /workflows ───────────────────────────────────────────────────────

  app.get<{
    Querystring: { name?: string; tags?: string; category?: string; domain?: string };
  }>(
    '/workflows',
    { schema: { description: 'List and search workflows', tags: ['workflow'] } },
    async (req, reply) => {
      const { name, tags, category, domain } = req.query;
      const workflows = repository.listWorkflows({
        name,
        tags: tags ? tags.split(',') : undefined,
        category,
        targetDomain: domain,
      });
      return reply.code(200).send({
        success: true,
        count: workflows.length,
        workflows: workflows.map((w) => ({
          id: w.id,
          name: w.name,
          version: w.version,
          variableCount: w.variables.length,
          stepCount: w.steps.length,
          tags: w.metadata.tags,
          updatedAt: w.updatedAt,
          successRate: w.metadata.successRate,
        })),
        stats: repository.getStats(),
      });
    },
  );
}
