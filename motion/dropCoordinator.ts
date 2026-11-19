/**
 * Sequencing for the drop-in, kept pure so it can be tested. BUG-3: nothing may
 * write state while the compose modal is dismissing, so the order is
 *   request (compose, fold plays) -> leaving (compose navigates back)
 *   -> dismissed (Home, transition ended) -> add + clear -> landed (Home, fall done).
 */
export type DropNote = { text: string; colour?: string };
type Phase = 'idle' | 'folding' | 'leaving' | 'adding' | 'landing';

export function createDropCoordinator() {
  let phase: Phase = 'idle';
  let pending: DropNote | null = null;

  return {
    phase: () => phase,
    pending: () => pending,
    /** Compose taps "Drop it in". False when a drop is already running, so no double-add. */
    request(note: DropNote): boolean {
      if (phase !== 'idle') return false;
      phase = 'folding';
      pending = note;
      return true;
    },
    /** The fold finished and compose is about to navigate back. */
    leaving(): boolean {
      if (phase !== 'folding') return false;
      phase = 'leaving';
      return true;
    },
    /** Compose could not leave (or the user backed out): drop the request. */
    cancel(): void {
      if (phase === 'folding' || phase === 'leaving') {
        phase = 'idle';
        pending = null;
      }
    },
    /**
     * Home calls this once the dismiss transition has ended. Adds, then clears the draft.
     * If the add fails the draft is kept and the coordinator returns to idle.
     */
    async dismissed(deps: { addNote: (n: DropNote) => Promise<unknown>; clear: () => void }): Promise<boolean> {
      if (phase !== 'leaving' || !pending) return false;
      phase = 'adding';
      try {
        await deps.addNote(pending);
      } catch {
        phase = 'idle';
        pending = null;
        return false;
      }
      deps.clear();
      pending = null;
      phase = 'landing';
      return true;
    },
    landed(): void {
      if (phase === 'landing') phase = 'idle';
    },
  };
}

export const dropCoordinator = createDropCoordinator();
