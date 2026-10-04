import type { ComponentNode, ConnectionEdge } from './model';

/** The canvas's Components and Connections at one point in time. */
export type Snapshot = { nodes: ComponentNode[]; edges: ConnectionEdge[] };

type Step = { before: Snapshot; label: string };

/** Steps kept; the oldest is dropped past this. */
export const HISTORY_LIMIT = 100;

/**
 * Undo and redo of the Architecture document for one visit to a Project. Each step is a snapshot of
 * the canvas before an edit, plus a label naming the edit ("Delete Database"). The canvas replaces
 * its arrays immutably, so snapshots share structure with the canvas and with each other.
 *
 * A step recorded with a `run` key merges into the step before it while that one is still open with
 * the same key, so typing in one field, or React Flow's two batches for one delete, is one step.
 * Any other step, an undo, a redo or `endRun` closes it.
 */
export class History {
  private past: Step[] = [];
  private future: Step[] = [];
  private run: string | null = null;

  /** Records an edit: `before` is the canvas as it was, `label` names the edit. Clears redo. */
  record(before: Snapshot, label: string, run?: string) {
    this.future = [];
    if (run !== undefined && run === this.run && this.past.length > 0) return;
    this.run = run ?? null;
    this.past = [...this.past, { before, label }].slice(-HISTORY_LIMIT);
  }

  /** Closes the open run, so the next edit is a step of its own. */
  endRun() {
    this.run = null;
  }

  /** Takes back the last step: returns the canvas to restore, given the canvas as it is now. */
  undo(current: Snapshot): Step | null {
    return this.move(this.past, this.future, current);
  }

  /** Reapplies the last step undone. */
  redo(current: Snapshot): Step | null {
    return this.move(this.future, this.past, current);
  }

  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  private move(from: Step[], to: Step[], current: Snapshot): Step | null {
    const step = from.pop();
    if (!step) return null;
    to.push({ before: current, label: step.label });
    this.run = null;
    return step;
  }
}

/** What a step changed, going from one snapshot to another, by id. */
export type StepChanges = {
  /** In `to` only. */
  added: Set<string>;
  /** In both, moved or edited. */
  changed: Set<string>;
  /** In `from` only: the Components and Connections themselves, as they were. */
  removed: Snapshot;
};

export function stepChanges(from: Snapshot, to: Snapshot): StepChanges {
  const added = new Set<string>();
  const changed = new Set<string>();
  const fromNodes = new Map(from.nodes.map((n) => [n.id, n]));
  const fromEdges = new Map(from.edges.map((e) => [e.id, e]));
  for (const n of to.nodes) {
    const old = fromNodes.get(n.id);
    if (!old) added.add(n.id);
    // Selecting or measuring keeps `data`; only an edit replaces it.
    else if (
      old.data !== n.data ||
      old.position.x !== n.position.x ||
      old.position.y !== n.position.y
    )
      changed.add(n.id);
  }
  for (const e of to.edges) {
    const old = fromEdges.get(e.id);
    if (!old) added.add(e.id);
    else if (old.data !== e.data || old.source !== e.source || old.target !== e.target)
      changed.add(e.id);
  }
  const toIds = new Set([...to.nodes, ...to.edges].map((x) => x.id));
  return {
    added,
    changed,
    removed: {
      nodes: from.nodes.filter((n) => !toIds.has(n.id)),
      edges: from.edges.filter((e) => !toIds.has(e.id)),
    },
  };
}
