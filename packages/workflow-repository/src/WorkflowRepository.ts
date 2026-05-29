import type {
  CompiledWorkflow,
  WorkflowRecording,
  WorkflowExecutionResult,
} from '@humanhands/shared-types';
import { WorkflowVersioning } from './WorkflowVersioning.js';

export interface WorkflowSearchQuery {
  name?: string;
  tags?: string[];
  category?: string;
  targetDomain?: string;
  hasVariables?: boolean;
}

export interface RepositoryStats {
  totalWorkflows: number;
  totalRecordings: number;
  totalExecutions: number;
  averageSuccessRate: number;
}

/**
 * In-memory workflow repository with persistence hooks.
 *
 * Designed for easy PostgreSQL backend swap in Step 5 —
 * all persistence logic is isolated in the save/load hooks.
 */
export class WorkflowRepository {
  private readonly workflows = new Map<string, CompiledWorkflow>();
  private readonly recordings = new Map<string, WorkflowRecording>();
  private readonly executions = new Map<string, WorkflowExecutionResult[]>();
  private readonly versioning = new WorkflowVersioning();

  // ── Workflows ─────────────────────────────────────────────────────────────

  saveWorkflow(workflow: CompiledWorkflow, changelog = ''): CompiledWorkflow {
    const existing = this.workflows.get(workflow.id);
    if (existing) {
      this.versioning.addVersion(existing, `Superseded by ${workflow.version}`);
    }
    const updated: CompiledWorkflow = {
      ...workflow,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(workflow.id, updated);
    this.versioning.addVersion(updated, changelog);
    return updated;
  }

  getWorkflow(id: string): CompiledWorkflow | undefined {
    return this.workflows.get(id);
  }

  deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  listWorkflows(query: WorkflowSearchQuery = {}): CompiledWorkflow[] {
    let results = Array.from(this.workflows.values());

    if (query.name) {
      const needle = query.name.toLowerCase();
      results = results.filter((w) => w.name.toLowerCase().includes(needle));
    }
    if (query.tags?.length) {
      const queryTags = new Set(query.tags);
      results = results.filter((w) =>
        w.metadata.tags?.some((t) => queryTags.has(t)),
      );
    }
    if (query.category) {
      results = results.filter((w) => w.metadata.category === query.category);
    }
    if (query.targetDomain) {
      results = results.filter((w) => w.metadata.targetDomain === query.targetDomain);
    }
    if (query.hasVariables !== undefined) {
      results = results.filter((w) =>
        query.hasVariables ? w.variables.length > 0 : w.variables.length === 0,
      );
    }

    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // ── Recordings ────────────────────────────────────────────────────────────

  saveRecording(recording: WorkflowRecording): void {
    this.recordings.set(recording.id, recording);
  }

  getRecording(id: string): WorkflowRecording | undefined {
    return this.recordings.get(id);
  }

  listRecordings(): WorkflowRecording[] {
    return Array.from(this.recordings.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  // ── Executions ────────────────────────────────────────────────────────────

  saveExecution(result: WorkflowExecutionResult): void {
    const list = this.executions.get(result.workflowId) ?? [];
    list.unshift(result);
    if (list.length > 50) list.pop(); // keep last 50 executions per workflow
    this.executions.set(result.workflowId, list);

    // Update workflow success rate
    const workflow = this.workflows.get(result.workflowId);
    if (workflow) {
      const allExecutions = list.filter((e) => e.mode === 'production');
      const successRate = allExecutions.filter((e) => e.status === 'completed').length / (allExecutions.length || 1);
      this.workflows.set(workflow.id, {
        ...workflow,
        metadata: {
          ...workflow.metadata,
          usageCount: (workflow.metadata.usageCount ?? 0) + 1,
          lastRunAt: new Date().toISOString(),
          successRate,
        },
      });
    }
  }

  getExecutionHistory(workflowId: string): WorkflowExecutionResult[] {
    return this.executions.get(workflowId) ?? [];
  }

  // ── Versioning ────────────────────────────────────────────────────────────

  getVersionHistory(workflowId: string) {
    return this.versioning.getVersionHistory(workflowId);
  }

  rollback(workflowId: string, version: string): CompiledWorkflow | null {
    const entry = this.versioning.rollback(workflowId, version);
    if (!entry) return null;
    this.workflows.set(workflowId, entry.workflow);
    return entry.workflow;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): RepositoryStats {
    const allExecutions = Array.from(this.executions.values()).flat();
    const prodExecutions = allExecutions.filter((e) => e.mode === 'production');
    const successRate = prodExecutions.length > 0
      ? prodExecutions.filter((e) => e.status === 'completed').length / prodExecutions.length
      : 0;

    return {
      totalWorkflows: this.workflows.size,
      totalRecordings: this.recordings.size,
      totalExecutions: allExecutions.length,
      averageSuccessRate: successRate,
    };
  }
}
