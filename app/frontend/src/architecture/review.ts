/**
 * The pending Proposal as the canvas sees it, shared with the chat so both can offer Accept and
 * Reject. Only the canvas can accept: accepting applies the Proposal to the canvas it holds.
 */
export type Review = {
  seq: number;
  /** Why the Proposal can't be applied any more, or null. */
  stale: string | null;
  busy: boolean;
  error: string | null;
  /** Current names of components and connections, by id, for describing changes. */
  names: Record<string, string>;
  accept: () => void;
  reject: () => void;
};
