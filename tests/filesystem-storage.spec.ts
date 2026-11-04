import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
test('links share identity, bytes and nanosecond times across rename, unlink and reload', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, writeAll, readAll } =
      await import('/tests/fixtures/host-harness.ts');
    const storage = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('fs', { create: true });
    let os = await Walos.create({ storage });
    let h = new HostProcessContext(os.getHostProcess());
    let [[root]] = h.fs.getDirectories();
    const file = await root.openAt({}, 'a', { create: true }, { read: true, write: true });
    const out = await file.writeViaStream(0n);
    await writeAll(out, new TextEncoder().encode('shared'));
    await out[Symbol.asyncDispose]();
    const t = { tag: 'timestamp' as const, val: { seconds: 123n, nanoseconds: 987654321 } };
    await file.setTimes(t, t);
    const hash = await file.metadataHash();
    await root.linkAt({}, 'a', root, 'b');
    await root.symlinkAt('b', 's');
    const b = await root.openAt({}, 'b', {}, { read: true, write: true });
    await b.write(new TextEncoder().encode('S'), 0n);
    await file.setTimes(t, t);
    const same = await file.isSameObject(b);
    const count = (await file.stat()).linkCount;
    const symbolic = (await root.statAt({}, 's')).type;
    const target = await root.readlinkAt('s');
    const followed = (await root.statAt({ symlinkFollow: true }, 's')).size;
    await root.renameAt('a', root, 'renamed');
    const time = (await file.stat()).dataModificationTimestamp;
    await root.unlinkFileAt('renamed');
    await root.unlinkFileAt('b');
    const zero = (await file.stat()).linkCount;
    const stream = await file.readViaStream(0n);
    await file[Symbol.asyncDispose]();
    const bytes = new TextDecoder().decode(await readAll(stream));
    await root.symlinkAt('later', 'dangling');
    const persist = await root.openAt({}, 'persist', { create: true }, { write: true });
    await persist.setTimes(t, t);
    await os.dispose();
    os = await Walos.create({ storage });
    h = new HostProcessContext(os.getHostProcess());
    [[root]] = h.fs.getDirectories();
    const persisted = (await root.statAt({}, 'persist')).dataModificationTimestamp;
    const dangling = await root.readlinkAt('dangling');
    const names = [];
    const listing = await root.readDirectory();
    for (;;) {
      const entry = await listing.readDirectoryEntry();
      if (!entry) break;
      names.push(entry.name);
    }
    await os.dispose();
    return {
      same,
      count: String(count),
      zero: String(zero),
      symbolic,
      target,
      followed: String(followed),
      time,
      persisted,
      bytes,
      dangling,
      names,
      hash: !!hash,
    };
  });
  expect(result).toMatchObject({
    same: true,
    count: '2',
    zero: '0',
    symbolic: 'symbolic-link',
    target: 'b',
    followed: '6',
    bytes: 'Shared',
    dangling: 'later',
    time: { seconds: 123n, nanoseconds: 987654321 },
    persisted: { seconds: 123n, nanoseconds: 987654321 },
  });
  expect(result.names.sort()).toEqual(['dangling', 'persist', 's']);
});
test('resolver enforces descriptor boundaries and resolves components before dot-dot', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create({ storage: await navigator.storage.getDirectory() });
    const h = new HostProcessContext(os.getHostProcess());
    const [[root]] = h.fs.getDirectories();
    await root.createDirectoryAt('dir');
    await root.createDirectoryAt('dir/sub');
    await root.symlinkAt('dir/sub', 'jump');
    await root.openAt({}, 'dir/file', { create: true }, { read: true });
    const resolved = await root.openAt({ symlinkFollow: true }, 'jump/../file', {}, { read: true });
    await root.symlinkAt('cycle', 'cycle');
    await root.symlinkAt('absent', 'dangling');
    await root.symlinkAt('..', 'dir/up');
    const dir = await root.openAt(
      {},
      'dir',
      { directory: true },
      { read: true, mutateDirectory: true },
    );
    const errors: string[] = [];
    for (const operation of [
      () => root.symlinkAt('/absolute', 'bad'),
      () => dir.statAt({ symlinkFollow: true }, 'up/file'),
      () => root.statAt({ symlinkFollow: true }, 'cycle'),
      () => root.statAt({ symlinkFollow: true }, 'dangling'),
      () => root.openAt({}, 'jump', {}, {}),
      () => root.linkAt({}, 'dir', root, 'hard-dir'),
      () => root.readlinkAt('dir/file'),
      () => root.statAt({}, 'absent/../dir'),
      () => root.statAt({}, 'dir/file/..'),
    ])
      try {
        await operation();
        errors.push('success');
      } catch (e: any) {
        errors.push(e.code);
      }
    const type = await resolved.getType();
    await os.dispose();
    return { errors, type };
  });
  expect(result.type).toBe('regular-file');
  expect(result.errors).toEqual([
    'not-permitted',
    'not-permitted',
    'loop',
    'no-entry',
    'loop',
    'not-permitted',
    'invalid',
    'no-entry',
    'not-directory',
  ]);
});
test('dedicated stores reject unknown data and recover uncommitted payloads without exposing internals', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/tests/fixtures/host-harness.ts');
    const top = await navigator.storage.getDirectory();
    const storage = await top.getDirectoryHandle('fs', { create: true });
    const unknown = await storage.getFileHandle('user', { create: true });
    let rejected = false;
    try {
      await Walos.create({ storage });
    } catch {
      rejected = true;
    }
    const retained = (await unknown.getFile()).size === 0;
    await storage.removeEntry('user');
    let os = await Walos.create({ storage });
    await os.dispose();
    const objects = await storage.getDirectoryHandle('objects');
    await objects.getFileHandle('uncommitted', { create: true });
    os = await Walos.create({ storage });
    const [[root]] = new HostProcessContext(os.getHostProcess()).fs.getDirectories();
    const entries = await root.readDirectory();
    const empty = await entries.readDirectoryEntry();
    let recovered = false;
    try {
      await objects.getFileHandle('uncommitted');
    } catch {
      recovered = true;
    }
    await os.dispose();
    return { rejected, retained, recovered, empty };
  });
  expect(result).toEqual({ rejected: true, retained: true, recovered: true, empty: undefined });
});

test('Host and four native P3 workers commit concurrent links without lost updates', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create({ storage: await navigator.storage.getDirectory() });
    try {
      const h = new HostProcessContext(os.getHostProcess());
      const [[root]] = h.fs.getDirectories();
      await root.openAt({}, 'shared', { create: true }, { read: true, write: true });
      const exe = await install(h, 'p3-probe');
      const children = ['a', 'b', 'c', 'd'].map((name) =>
        run(h, exe, ['p3-probe', 'fs-race', name]),
      );
      for (let i = 0; i < 8; i++) await root.linkAt({}, 'shared', root, `host-${i}`);
      const exits = (await Promise.all(children)).map((r) => r.exit);
      return { exits, count: String((await root.statAt({}, 'shared')).linkCount) };
    } finally {
      await os.dispose();
    }
  });
  expect(result.count).toBe('41');
  expect(result.exits).toEqual(Array(4).fill({ kind: 'exited', code: 0 }));
});

test('directory rename preserves descriptors and failed timestamp updates are atomic', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/tests/fixtures/host-harness.ts');
    const storage = await navigator.storage.getDirectory();
    let os = await Walos.create({ storage });
    let h = new HostProcessContext(os.getHostProcess());
    let [[root]] = h.fs.getDirectories();
    await root.createDirectoryAt('a');
    await root.createDirectoryAt('b');
    const dir = await root.openAt(
      {},
      'a',
      { directory: true },
      { read: true, mutateDirectory: true },
    );
    const f = await dir.openAt({}, '__proto__', { create: true }, { read: true, write: true });
    const time = { tag: 'timestamp' as const, val: { seconds: 100n, nanoseconds: 123 } };
    await f.setTimes(time, time);
    const hash = await f.metadataHash();
    let rejected = false;
    try {
      await f.setTimes(
        { tag: 'now' },
        { tag: 'timestamp', val: { seconds: 1n, nanoseconds: 1e9 } },
      );
    } catch {
      rejected = true;
    }
    const unchanged = (await f.stat()).dataAccessTimestamp;
    await f.setTimes({ tag: 'no-change' }, { tag: 'no-change' });
    const stable =
      JSON.stringify(hash, (_, v) => (typeof v === 'bigint' ? String(v) : v)) ===
      JSON.stringify(await f.metadataHash(), (_, v) => (typeof v === 'bigint' ? String(v) : v));
    await root.renameAt('a', root, 'b');
    const same = await f.isSameObject(await root.openAt({}, 'b/__proto__', {}, { read: true }));
    const fromDescriptor = (await dir.statAt({}, '__proto__')).dataModificationTimestamp;
    await os.dispose();
    os = await Walos.create({ storage });
    h = new HostProcessContext(os.getHostProcess());
    [[root]] = h.fs.getDirectories();
    const reopened = await root.metadataHashAt({}, 'b/__proto__');
    await os.dispose();
    return {
      rejected,
      unchanged,
      stable,
      same,
      fromDescriptor,
      persistentHash: hash.lower === reopened.lower && hash.upper === reopened.upper,
    };
  });
  expect(result).toEqual({
    rejected: true,
    unchanged: { seconds: 100n, nanoseconds: 123 },
    stable: true,
    same: true,
    fromDescriptor: { seconds: 100n, nanoseconds: 123 },
    persistentHash: true,
  });
});

test('terminating a worker before namespace commit preserves the previous snapshot', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/tests/fixtures/host-harness.ts');
    const storage = await navigator.storage.getDirectory();
    let os = await Walos.create({ storage });
    const [[root]] = new HostProcessContext(os.getHostProcess()).fs.getDirectories();
    await root.openAt({}, 'kept', { create: true }, { read: true });
    await os.dispose();
    const worker = new Worker('/tests/fixtures/fs-transaction.worker.ts', { type: 'module' });
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = () => resolve();
      worker.onerror = reject;
      worker.postMessage(storage);
    });
    worker.terminate();
    os = await Walos.create({ storage });
    const [[reopened]] = new HostProcessContext(os.getHostProcess()).fs.getDirectories();
    const listing = await reopened.readDirectory();
    const names = [];
    for (;;) {
      const e = await listing.readDirectoryEntry();
      if (!e) break;
      names.push(e.name);
    }
    const objects = await storage.getDirectoryHandle('objects');
    const payloads = [];
    for await (const name of objects.keys()) payloads.push(name);
    await os.dispose();
    return { names, payloads: payloads.length };
  });
  expect(result).toEqual({ names: ['kept'], payloads: 1 });
});

test('stream completion preserves times explicitly set after a write, including moved stdio', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install } = await import('/tests/fixtures/host-harness.ts');
    const storage = await navigator.storage.getDirectory();
    let os = await Walos.create({ storage });
    const h = new HostProcessContext(os.getHostProcess());
    const [[root]] = h.fs.getDirectories();
    const f = await root.openAt({}, 'file', { create: true }, { write: true, read: true });
    const out = await f.writeViaStream(0n);
    out.checkWrite();
    await out.write(new Uint8Array([1]));
    const auto = (await f.stat()).dataModificationTimestamp;
    const explicit = { tag: 'timestamp' as const, val: { seconds: 10n, nanoseconds: 123 } };
    await f.setTimes(explicit, explicit);
    await out.blockingFlush();
    await out[Symbol.asyncDispose]();
    const after = (await f.stat()).dataModificationTimestamp;
    const moved = await f.writeViaStream(1n);
    moved.checkWrite();
    await moved.write(new Uint8Array([2]));
    await f.setTimes(explicit, explicit);
    const child = await h.process.spawn(
      await install(h, 'true'),
      ['true'],
      [{ key: 'PWD', value: '/' }],
      undefined,
      moved,
    );
    const exit = await child.wait();
    const movedTime = (await f.stat()).dataModificationTimestamp;
    await os.dispose();
    os = await Walos.create({ storage });
    const [[reopened]] = new HostProcessContext(os.getHostProcess()).fs.getDirectories();
    const persisted = (await reopened.statAt({}, 'file')).dataModificationTimestamp;
    await os.dispose();
    return { auto: auto!.seconds > 1700000000n, after, movedTime, persisted, exit };
  });
  expect(result).toEqual({
    auto: true,
    after: { seconds: 10n, nanoseconds: 123 },
    movedTime: { seconds: 10n, nanoseconds: 123 },
    persisted: { seconds: 10n, nanoseconds: 123 },
    exit: { kind: 'exited', code: 0 },
  });
});

test('provided stores isolate namespaces and a removed directory cannot gain entries', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/tests/fixtures/host-harness.ts');
    const top = await navigator.storage.getDirectory();
    const a = await Walos.create({ storage: await top.getDirectoryHandle('a', { create: true }) });
    const b = await Walos.create({ storage: await top.getDirectoryHandle('b', { create: true }) });
    try {
      const [[ra]] = new HostProcessContext(a.getHostProcess()).fs.getDirectories();
      const [[rb]] = new HostProcessContext(b.getHostProcess()).fs.getDirectories();
      await ra.openAt({}, 'only-a', { create: true }, { write: true });
      let isolated = false;
      try {
        await rb.statAt({}, 'only-a');
      } catch (e: any) {
        isolated = e.code === 'no-entry';
      }
      await ra.createDirectoryAt('gone');
      const gone = await ra.openAt({}, 'gone', { directory: true }, { mutateDirectory: true });
      await ra.removeDirectoryAt('gone');
      const errors = [];
      for (const operation of [
        () => gone.createDirectoryAt('child'),
        () => gone.openAt({}, 'child', { create: true }, { write: true }),
        () => gone.symlinkAt('.', 'child'),
        () => ra.linkAt({}, 'only-a', gone, 'child'),
      ])
        try {
          await operation();
          errors.push('success');
        } catch (e: any) {
          errors.push(e.code);
        }
      return { isolated, errors };
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });
  expect(result).toEqual({ isolated: true, errors: Array(4).fill('no-entry') });
});

test('signed P3 timestamps survive reload and legacy stat reports overflow', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const storage = await navigator.storage.getDirectory();
    let os = await Walos.create({ storage });
    let h = new HostProcessContext(os.getHostProcess());
    let [[root]] = h.fs.getDirectories();
    const f = await root.openAt({}, 'negative', { create: true }, { read: true, write: true });
    const a = { tag: 'timestamp' as const, val: { seconds: -0x8000000000000000n, nanoseconds: 0 } };
    const m = { tag: 'timestamp' as const, val: { seconds: -1n, nanoseconds: 999999999 } };
    await f.setTimes(a, m);
    let invalid = false;
    try {
      await f.setTimes(a, {
        tag: 'timestamp',
        val: { seconds: 0x8000000000000000n, nanoseconds: 0 },
      });
    } catch (e: any) {
      invalid = e.code === 'invalid';
    }
    const outcomes = [];
    for (const name of ['fs-probe', 'p2-fs-probe'])
      outcomes.push(await run(h, await install(h, name), [name, 'negative']));
    await os.dispose();
    os = await Walos.create({ storage });
    h = new HostProcessContext(os.getHostProcess());
    [[root]] = h.fs.getDirectories();
    const stat = await root.statAt({}, 'negative');
    await os.dispose();
    return {
      invalid,
      outcomes: outcomes.map((x) => ({ exit: x.exit, stdout: x.stdout })),
      a: stat.dataAccessTimestamp,
      m: stat.dataModificationTimestamp,
    };
  });
  expect(result).toEqual({
    invalid: true,
    outcomes: Array(2).fill({
      exit: { kind: 'exited', code: 0 },
      stdout: 'negative timestamp overflow\n',
    }),
    a: { seconds: -0x8000000000000000n, nanoseconds: 0 },
    m: { seconds: -1n, nanoseconds: 999999999 },
  });
});
