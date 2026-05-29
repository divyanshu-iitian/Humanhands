import type { CompiledWorkflow } from '@humanhands/shared-types';

export interface VersionEntry {
  versionId: string;
  version: string;
  workflowId: string;
  workflow: CompiledWorkflow;
  createdAt: number;
  changelog: string;
  isCurrent: boolean;
}

export interface MigrationNote {
  from: string;
  to: string;
  breaking: boolean;
  notes: string[];
}

export class WorkflowVersioning {
  private readonly versions = new Map<string, VersionEntry[]>();

  addVersion(workflow: CompiledWorkflow, changelog = ''): VersionEntry {
    const entries = this.versions.get(workflow.id) ?? [];
    for (const entry of entries) entry.isCurrent = false;

    const newEntry: VersionEntry = {
      versionId: `${workflow.id}_v${workflow.version}`,
      version: workflow.version,
      workflowId: workflow.id,
      workflow,
      createdAt: Date.now(),
      changelog,
      isCurrent: true,
    };

    entries.push(newEntry);
    this.versions.set(workflow.id, entries);
    return newEntry;
  }

  getVersionHistory(workflowId: string): VersionEntry[] {
    return (this.versions.get(workflowId) ?? []).sort((a, b) => b.createdAt - a.createdAt);
  }

  getCurrentVersion(workflowId: string): VersionEntry | undefined {
    return this.versions.get(workflowId)?.find((v) => v.isCurrent);
  }

  getVersion(workflowId: string, version: string): VersionEntry | undefined {
    return this.versions.get(workflowId)?.find((v) => v.version === version);
  }

  rollback(workflowId: string, targetVersion: string): VersionEntry | null {
    const entries = this.versions.get(workflowId);
    if (!entries) return null;

    const target = entries.find((v) => v.version === targetVersion);
    if (!target) return null;

    for (const entry of entries) entry.isCurrent = false;
    target.isCurrent = true;
    return target;
  }

  diff(workflowId: string, v1: string, v2: string): MigrationNote | null {
    const e1 = this.getVersion(workflowId, v1);
    const e2 = this.getVersion(workflowId, v2);
    if (!e1 || !e2) return null;

    const notes: string[] = [];
    const w1 = e1.workflow;
    const w2 = e2.workflow;

    // Detect step count changes
    if (w1.steps.length !== w2.steps.length) {
      notes.push(`Steps: ${w1.steps.length} → ${w2.steps.length}`);
    }

    // Detect variable changes
    const v1vars = new Set(w1.variables.map((v) => v.name));
    const v2vars = new Set(w2.variables.map((v) => v.name));
    for (const name of v2vars) {
      if (!v1vars.has(name)) notes.push(`New variable: {{${name}}}`);
    }
    for (const name of v1vars) {
      if (!v2vars.has(name)) notes.push(`Removed variable: {{${name}}}`);
    }

    // Detect selector changes (could break execution)
    const breaking = w1.steps.some((s1, i) => {
      const s2 = w2.steps[i];
      if (!s2) return true;
      const t1 = s1.action.target;
      const t2 = s2.action.target;
      if (t1?.kind === 'selector' && t2?.kind === 'selector') {
        return t1.selector !== t2.selector;
      }
      return false;
    });

    if (breaking) notes.push('Selector changes detected — verify selectors still work');

    return { from: v1, to: v2, breaking, notes };
  }
}
