import { createOutbox, draftStore, DRAFT_KEY, type KeyValueStore } from '@/lib/data/outbox';

function memStore() {
  const m = new Map<string, string>();
  const store: KeyValueStore = {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
  return { m, store };
}
const note = (id: string, text = id) => ({ clientId: id, text, createdAt: 1 });

describe('outbox', () => {
  it('queues, persists and counts pending notes', async () => {
    const { m, store } = memStore();
    const o = createOutbox(store);
    await o.enqueue(note('a'));
    await o.enqueue(note('b'));
    expect(o.getPendingCount()).toBe(2);
    expect(m.has('jarful.outbox.note.a')).toBe(true);
  });

  it('dedupes the same clientId', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue(note('a'));
    await o.enqueue(note('a'));
    expect(o.getPendingCount()).toBe(1);
  });

  it('survives a restart and sends in order, then empties', async () => {
    const { m, store } = memStore();
    await createOutbox(store).enqueue(note('a'));
    await createOutbox(store).enqueue(note('b'));
    const o2 = createOutbox(store); // new process
    const sent: string[] = [];
    await o2.flush(async (n) => void sent.push(n.clientId));
    expect(sent).toEqual(['a', 'b']);
    expect(o2.getPendingCount()).toBe(0);
    expect([...m.keys()].filter((k) => k.includes('note.'))).toEqual([]);
  });

  it('keeps notes on failure and retries later', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue(note('a'));
    await o.enqueue(note('b'));
    const send = jest.fn().mockRejectedValueOnce(new Error('network'));
    await o.flush(send);
    expect(send).toHaveBeenCalledTimes(1); // stops at first failure
    expect(o.getPendingCount()).toBe(2);
    send.mockResolvedValue(undefined);
    await o.flush(send);
    expect(o.getPendingCount()).toBe(0);
  });

  it('drops notes the server will never accept', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue(note('a'));
    await o.flush(async () => {
      throw new Error('Note is empty');
    });
    expect(o.getPendingCount()).toBe(0);
  });

  it('runs one flush at a time', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue(note('a'));
    const send = jest.fn().mockResolvedValue(undefined);
    await Promise.all([o.flush(send), o.flush(send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('draft', () => {
  it('restores after a restart and clears', async () => {
    const { m, store } = memStore();
    await draftStore(store).write('half a thought');
    expect(await draftStore(store).read()).toBe('half a thought');
    await draftStore(store).clear();
    expect(m.has(DRAFT_KEY)).toBe(false);
  });
  it('empty text removes the key', async () => {
    const { m, store } = memStore();
    await draftStore(store).write('x');
    await draftStore(store).write('');
    expect(m.size).toBe(0);
  });
});

describe('outbox user mismatch (NOTE-3)', () => {
  it('sends notes of the current user and stamps unowned ones', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue({ ...note('a'), userId: 'u1' });
    await o.enqueue(note('b')); // written before the user was known
    o.setCurrentUser('u1');
    const sent: string[] = [];
    await o.flush(async (n) => void sent.push(n.clientId));
    expect(sent).toEqual(['a', 'b']);
  });

  it('holds notes written by another user instead of sending them', async () => {
    const { store } = memStore();
    const o = createOutbox(store);
    await o.enqueue({ ...note('a'), userId: 'old' });
    await o.enqueue({ ...note('b'), userId: 'new' });
    o.setCurrentUser('new');
    expect(o.getPendingCount()).toBe(1);
    expect(o.getHeldCount()).toBe(1);
    const sent: string[] = [];
    await o.flush(async (n) => void sent.push(n.clientId));
    expect(sent).toEqual(['b']);
    expect(o.getHeldCount()).toBe(1);
    // still on the device after a restart
    const o2 = createOutbox(store);
    await o2.load();
    o2.setCurrentUser('new');
    expect(o2.getHeldCount()).toBe(1);
  });

  it('sends held notes when the original user is back', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue({ ...note('a'), userId: 'old' });
    o.setCurrentUser('new');
    o.setCurrentUser('old');
    const sent: string[] = [];
    await o.flush(async (n) => void sent.push(n.clientId));
    expect(sent).toEqual(['a']);
  });

  it('adoptHeld moves held notes to the current user on request', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue({ ...note('a'), userId: 'old' });
    o.setCurrentUser('new');
    await o.adoptHeld();
    expect(o.getHeldCount()).toBe(0);
    expect(o.getPendingCount()).toBe(1);
  });

  it('reassign follows an anonymous user into the account after a merge', async () => {
    const o = createOutbox(memStore().store);
    await o.enqueue({ ...note('a'), userId: 'anon' });
    o.setCurrentUser('acct');
    expect(o.getHeldCount()).toBe(1);
    await o.reassign('anon', 'acct');
    expect(o.getHeldCount()).toBe(0);
    expect(o.getPendingCount()).toBe(1);
  });

  it('clear removes every pending note', async () => {
    const { m, store } = memStore();
    const o = createOutbox(store);
    await o.enqueue({ ...note('a'), userId: 'x' });
    await o.clear();
    expect(o.getPendingCount()).toBe(0);
    expect([...m.keys()].filter((k) => k.includes('outbox'))).toEqual([]);
  });
});
