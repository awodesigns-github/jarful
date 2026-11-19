import { createDropCoordinator } from '@/motion/dropCoordinator';

const note = { text: 'a good thing' };

describe('drop-in sequencing (BUG-3)', () => {
  it('does not double-add on a second tap', async () => {
    const c = createDropCoordinator();
    const addNote = jest.fn().mockResolvedValue(undefined);
    expect(c.request(note)).toBe(true);
    expect(c.request(note)).toBe(false);
    c.leaving();
    await c.dismissed({ addNote, clear: jest.fn() });
    await c.dismissed({ addNote, clear: jest.fn() });
    expect(addNote).toHaveBeenCalledTimes(1);
  });

  it('adds only after the dismiss, never before', async () => {
    const c = createDropCoordinator();
    const addNote = jest.fn().mockResolvedValue(undefined);
    c.request(note);
    expect(await c.dismissed({ addNote, clear: jest.fn() })).toBe(false); // still folding
    c.leaving();
    expect(addNote).not.toHaveBeenCalled();
    expect(await c.dismissed({ addNote, clear: jest.fn() })).toBe(true);
    expect(addNote).toHaveBeenCalledWith(note);
  });

  it('clears the draft only after a successful add', async () => {
    const c = createDropCoordinator();
    const clear = jest.fn();
    c.request(note);
    c.leaving();
    expect(await c.dismissed({ addNote: jest.fn().mockRejectedValue(new Error('x')), clear })).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(c.phase()).toBe('idle');
    expect(c.request(note)).toBe(true); // can retry
  });

  it('returns to idle after landing', async () => {
    const c = createDropCoordinator();
    c.request(note);
    c.leaving();
    await c.dismissed({ addNote: jest.fn().mockResolvedValue(1), clear: jest.fn() });
    expect(c.phase()).toBe('landing');
    c.landed();
    expect(c.phase()).toBe('idle');
  });
});
