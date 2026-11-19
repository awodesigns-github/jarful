/**
 * Toggle a favourite instantly in local state, ask the server, and put it back if the server says no.
 * Returns the state the UI should end on.
 */
export async function toggleFavourite(opts: {
  current: boolean;
  apply: (next: boolean) => void;
  save: (next: boolean) => Promise<unknown>;
}): Promise<boolean> {
  const next = !opts.current;
  opts.apply(next);
  try {
    await opts.save(next);
    return next;
  } catch {
    opts.apply(opts.current);
    return opts.current;
  }
}
