import type { RecordedAction } from '@humanhands/shared-types';

export interface NoiseReductionResult {
  actions: RecordedAction[];
  removedCount: number;
  removedReasons: string[];
}

/**
 * Removes noise from raw action recordings before compilation.
 *
 * Noise sources:
 * 1. Failed actions (succeeded = false) — unless they're the only occurrence
 * 2. Accidental double-clicks on same target within 500ms
 * 3. Redundant hover actions (hovers with no follow-up interaction)
 * 4. Type → clear → retype sequences (collapse to final value)
 * 5. Aborted navigations (navigated away immediately)
 * 6. Focus-only events with no subsequent interaction
 */
export class NoiseReducer {
  private static readonly DOUBLE_CLICK_THRESHOLD_MS = 600;
  private static readonly STALE_HOVER_THRESHOLD_MS = 2000;

  reduce(actions: RecordedAction[]): NoiseReductionResult {
    let filtered = [...actions];
    const removedReasons: string[] = [];
    const initialCount = filtered.length;

    filtered = this.removeFailedActions(filtered, removedReasons);
    filtered = this.collapseDoubleClicks(filtered, removedReasons);
    filtered = this.removeStaleHovers(filtered, removedReasons);
    filtered = this.collapseTypeSequences(filtered, removedReasons);
    filtered = this.removeRedundantFocusEvents(filtered, removedReasons);
    filtered = this.collapseNavigations(filtered, removedReasons);

    return {
      actions: filtered,
      removedCount: initialCount - filtered.length,
      removedReasons,
    };
  }

  private removeFailedActions(actions: RecordedAction[], reasons: string[]): RecordedAction[] {
    return actions.filter((action) => {
      if (!action.executionMeta.succeeded) {
        reasons.push(`Removed failed ${action.actionType} (seq ${action.sequenceNumber})`);
        return false;
      }
      return true;
    });
  }

  private collapseDoubleClicks(actions: RecordedAction[], reasons: string[]): RecordedAction[] {
    const result: RecordedAction[] = [];
    for (let i = 0; i < actions.length; i++) {
      const current = actions[i]!;
      const next = actions[i + 1];
      if (
        next &&
        current.actionType === 'click' &&
        next.actionType === 'click' &&
        current.target?.elementId === next.target?.elementId &&
        next.timestamp - current.timestamp < NoiseReducer.DOUBLE_CLICK_THRESHOLD_MS
      ) {
        reasons.push(`Collapsed double-click on ${current.target?.text ?? 'element'} (seq ${current.sequenceNumber})`);
        i++; // skip next, keep the latter click
        result.push(next);
      } else {
        result.push(current);
      }
    }
    return result;
  }

  private removeStaleHovers(actions: RecordedAction[], reasons: string[]): RecordedAction[] {
    return actions.filter((action, idx) => {
      if (action.actionType !== 'hover') return true;
      // Keep hover if followed by a click/interaction on the same element
      const next = actions[idx + 1];
      const isFollowedByInteraction =
        next &&
        (next.actionType === 'click' || next.actionType === 'type') &&
        next.target?.elementId === action.target?.elementId &&
        next.timestamp - action.timestamp < NoiseReducer.STALE_HOVER_THRESHOLD_MS;

      if (!isFollowedByInteraction) {
        reasons.push(`Removed stale hover on ${action.target?.text ?? 'element'} (seq ${action.sequenceNumber})`);
        return false;
      }
      return true;
    });
  }

  private collapseTypeSequences(actions: RecordedAction[], reasons: string[]): RecordedAction[] {
    const result: RecordedAction[] = [];
    let i = 0;

    while (i < actions.length) {
      const current = actions[i]!;

      if (current.actionType !== 'type') {
        result.push(current);
        i++;
        continue;
      }

      // Look ahead for type + clear + retype patterns on same target
      let j = i + 1;
      let lastTypeAction = current;

      while (j < actions.length) {
        const next = actions[j]!;
        if (
          next.actionType === 'type' &&
          next.target?.elementId === current.target?.elementId
        ) {
          reasons.push(
            `Collapsed type sequence on ${current.target?.text ?? 'input'} — using final value`
          );
          lastTypeAction = next;
          j++;
        } else if (next.actionType === 'clear' || next.actionType === 'focus') {
          j++;
        } else {
          break;
        }
      }

      result.push(lastTypeAction);
      i = j;
    }

    return result;
  }

  private removeRedundantFocusEvents(actions: RecordedAction[], reasons: string[]): RecordedAction[] {
    return actions.filter((action, idx) => {
      if (action.actionType !== 'focus') return true;
      const next = actions[idx + 1];
      if (next && next.actionType === 'type' && next.target?.elementId === action.target?.elementId) {
        reasons.push(`Removed redundant focus before type (seq ${action.sequenceNumber})`);
        return false;
      }
      return true;
    });
  }

  private collapseNavigations(actions: RecordedAction[], reasons: string[]): RecordedAction[] {
    const result: RecordedAction[] = [];
    for (let i = 0; i < actions.length; i++) {
      const current = actions[i]!;
      // If two consecutive navigate actions with the same URL, keep the last
      const next = actions[i + 1];
      if (
        current.actionType === 'navigate' &&
        next?.actionType === 'navigate' &&
        current.url === next.url
      ) {
        reasons.push(`Collapsed duplicate navigation to ${current.url}`);
        continue;
      }
      result.push(current);
    }
    return result;
  }
}
