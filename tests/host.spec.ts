import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
test('empty OS preserves OPFS, has one Host without JSPI or command fetches, immutable snapshots and idempotent disposal', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/packages/os/dist/index.js');
    const root = await navigator.storage.getDirectory();
    for (const name of ['bin', 'home', 'tmp']) {
      const dir = await root.getDirectoryHandle(name, { create: true });
      const w = await (await dir.getFileHandle('sentinel', { create: true })).createWritable();
      await w.write(name);
      await w.close();
    }
    const original = WebAssembly.Suspending;
    Object.defineProperty(WebAssembly, 'Suspending', { value: undefined, configurable: true });
    const env = { A: 'before' },
      argv = ['host'];
    const pending = Walos.create({ env, argv });
    env.A = 'after';
    argv[0] = 'after';
    const os = await pending;
    const h = new HostProcessContext(os.getHostProcess());
    const snapshot = {
      pid: h.pid,
      ppid: h.ppid,
      args: [...h.args],
      env: h.env.entries(),
      same: h.context === os.getHostProcess(),
      processes: os.processes,
    };
    const other = await Walos.create({ env: { PWD: 'relative' } });
    const pwd = new HostProcessContext(other.getHostProcess()).env.get('PWD');
    await other.dispose();
    const stdin = h.io.stdin;
    let eof = '';
    try {
      await stdin.blockingRead(1n);
    } catch (e: any) {
      eof = e.code;
    }
    const out = h.io.stdout;
    const out2 = h.io.stdout;
    await out[Symbol.asyncDispose]();
    out2.checkWrite();
    await out2.write(new Uint8Array([1]));
    const frozen = Object.isFrozen(h.args) && Object.isFrozen(h.env.entries());
    const d = os.dispose();
    const sameDispose = d === os.dispose();
    await d;
    await os[Symbol.asyncDispose]();
    const rejected = [];
    for (const fn of [
      () => new HostProcessContext(os.getHostProcess()),
      () => h.fs.getDirectories(),
      () => h.env.get('PWD'),
      () => h.clock.wall.now(),
      () => h.random.getRandomBytes(1n),
    ])
      try {
        fn();
      } catch (e: any) {
        rejected.push(e.code);
      }
    const preserved = [];
    for (const name of ['bin', 'home', 'tmp'])
      preserved.push(
        await (await (await root.getDirectoryHandle(name)).getFileHandle('sentinel'))
          .getFile()
          .then((f) => f.text()),
      );
    Object.defineProperty(WebAssembly, 'Suspending', { value: original });
    return {
      snapshot,
      pwd,
      eof,
      sameDispose,
      rejected,
      preserved,
      processes: os.processes,
      legacy: ['boot', 'attach', 'interrupt', 'writeInput', 'foreground'].some((k) => k in os),
      hostLegacy: ['cwd', 'chdir', 'terminal'].some((k) => k in h),
      frozen,
    };
  });
  expect(result.snapshot).toMatchObject({
    pid: 1,
    ppid: null,
    args: ['host'],
    same: true,
    env: [
      { key: 'A', value: 'before' },
      { key: 'PWD', value: '/' },
    ],
    processes: [{ pid: 1, parent: null, state: 'RUNNING', argv: ['host'] }],
  });
  expect(result).toMatchObject({
    pwd: 'relative',
    eof: 'closed',
    sameDispose: true,
    rejected: Array(5).fill('invalid-resource'),
    preserved: ['bin', 'home', 'tmp'],
    processes: [],
    legacy: false,
    hostLegacy: false,
    frozen: true,
  });
});
for (const name of ['echo', 'p2-echo', 'true', 'p2-true', 'trap', 'p2-trap'])
  test(`Host spawns ${name}, preserves fast EXIT and separates stdio`, async ({ page }) => {
    const result = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const host = new HostProcessContext(os.getHostProcess());
        const exe = await install(host, name);
        const result = await run(host, exe, [name, 'こんにちは', 'two words']);
        const type = await exe.getType();
        await exe[Symbol.asyncDispose]();
        return { ...result, type };
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result.type).toBe('regular-file');
    expect(result.exit.kind).toBe(name.includes('trap') ? 'trap' : 'exited');
    expect(result.stderr).toBe('');
    if (name.includes('echo')) expect(result.stdout).toBe('こんにちは two words\n');
  });
test('wait consumes its right on invocation; stop works during wait; handle drop lets the child continue; OS shutdown settles waits', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install } = await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create();
    const h = new HostProcessContext(os.getHostProcess());
    const exe = await install(h, 'hang');
    const child = await h.process.spawn(exe, ['hang'], [{ key: 'PWD', value: '/' }]);
    const waiting = child.wait();
    const duplicate = await child.wait().catch((e: any) => e.code);
    await child.requestStop();
    const stopped = await waiting;
    const stillLocal = child.pid();
    await child[Symbol.asyncDispose]();
    const dropped = await h.process.spawn(exe, ['hang'], [{ key: 'PWD', value: '/' }]);
    const pid = dropped.pid();
    await dropped[Symbol.asyncDispose]();
    await dropped[Symbol.asyncDispose]();
    const survived = os.processes.some((p) => p.pid === pid && p.state === 'RUNNING');
    const pending = await h.process.spawn(exe, ['hang'], [{ key: 'PWD', value: '/' }]);
    const exit = pending.wait();
    await os.dispose();
    return { duplicate, stopped, stillLocal, survived, shutdown: await exit };
  });
  expect(result.duplicate).toBe('already-consumed');
  expect(result.stopped.kind).toBe('terminated');
  expect(result.survived).toBe(true);
  expect(result.shutdown.kind).toBe('terminated');
});
for (const source of ['cat', 'p2-cat', 'p3-probe'])
  for (const dest of ['cat', 'p2-cat', 'p3-probe'])
    test(`Host → ${source} → ${dest} → Host transfers 1 MiB with backpressure`, async ({
      page,
    }) => {
      const result = await page.evaluate(
        async ({ source, dest }) => {
          const { Walos, HostProcessContext, install, readAll, writeAll } = await import(
            '/tests/fixtures/host-harness.ts'
          );
          const os = await Walos.create();
          try {
            const h = new HostProcessContext(os.getHostProcess());
            const a = await install(h, source),
              b = source === dest ? a : await install(h, dest);
            const [stdin, writer] = await h.io.createPipe(),
              [middle, producer] = await h.io.createPipe(),
              [reader, stdout] = await h.io.createPipe();
            const reading = readAll(reader);
            const expected = Uint8Array.from({ length: 1048576 }, (_, i) => i % 251);
            const start = performance.now();
            const c1 = await h.process.spawn(
              a,
              source === 'p3-probe' ? [source, 'cat'] : [source],
              [{ key: 'PWD', value: '/' }],
              stdin,
              producer,
            );
            const c2 = await h.process.spawn(
              b,
              dest === 'p3-probe' ? [dest, 'cat'] : [dest],
              [{ key: 'PWD', value: '/' }],
              middle,
              stdout,
            );
            await writeAll(writer, expected);
            await writer[Symbol.asyncDispose]();
            const exits = await Promise.all([c1.wait(), c2.wait()]);
            const bytes = await reading;
            await c1[Symbol.asyncDispose]();
            await c2[Symbol.asyncDispose]();
            return {
              length: bytes.length,
              equal: bytes.every((n, i) => n === expected[i]),
              exits,
              duration: performance.now() - start,
            };
          } finally {
            await os.dispose();
          }
        },
        { source, dest },
      );
      expect(result.length).toBe(1048576);
      expect(result.equal).toBe(true);
      expect(result.exits).toEqual([
        { kind: 'exited', code: 0 },
        { kind: 'exited', code: 0 },
      ]);
      console.log(`${source} → ${dest}: ${result.duration.toFixed(1)} ms`);
    });
test('Descriptor-relative Host I/O, directory operations, offsets, independent streams, and typed path errors', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, readAll, writeAll } = await import(
      '/tests/fixtures/host-harness.ts'
    );
    const os = await Walos.create({ env: { PWD: '/does-not-exist' } });
    try {
      const h = new HostProcessContext(os.getHostProcess());
      const [[root]] = h.fs.getDirectories();
      await root.createDirectoryAt('relative');
      const dir = await root.openAt(
        {},
        'relative',
        { directory: true },
        { read: true, mutateDirectory: true },
      );
      const file = await dir.openAt({}, 'file', { create: true }, { read: true, write: true });
      await file.write(new TextEncoder().encode('abcdef'), 0n);
      await file.write(new TextEncoder().encode('XY'), 2n);
      const stream = await file.readViaStream(0n);
      await file[Symbol.asyncDispose]();
      const text = new TextDecoder().decode(await readAll(stream));
      const outFile = await dir.openAt({}, 'other', { create: true }, { read: true, write: true });
      const out = await outFile.writeViaStream(3n);
      await outFile[Symbol.asyncDispose]();
      await writeAll(out, new Uint8Array([1, 2]));
      await out[Symbol.asyncDispose]();
      const stat = await dir.statAt({}, 'other');
      const reopened = await dir.openAt({}, 'other', {}, { read: true });
      const [bytes] = await reopened.read(10n, 0n);
      await reopened[Symbol.asyncDispose]();
      const errors = [];
      for (const path of ['../escape', '/absolute', 'missing'])
        try {
          await dir.openAt({}, path, {}, { read: true });
        } catch (e: any) {
          errors.push(e.code);
        }
      await dir.renameAt('file', dir, 'renamed');
      const entries = await dir.readDirectory();
      const names = [];
      for (;;) {
        const e = await entries.readDirectoryEntry();
        if (!e) break;
        names.push(e.name);
      }
      await entries[Symbol.asyncDispose]();
      await dir.unlinkFileAt('renamed');
      await dir.unlinkFileAt('other');
      await root.removeDirectoryAt('relative');
      return { text, bytes: [...bytes], size: Number(stat.size), errors, names: names.sort() };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({
    text: 'abXYef',
    bytes: [0, 0, 0, 1, 2],
    size: 5,
    errors: ['not-permitted', 'not-permitted', 'no-entry'],
    names: ['other', 'renamed'],
  });
});
test('stdio move is immediate on failed spawn and foreign resources are rejected', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create();
    const other = await Walos.create();
    try {
      const h = new HostProcessContext(os.getHostProcess());
      const [[dir]] = h.fs.getDirectories();
      const [r, w] = await h.io.createPipe();
      const spawn = h.process.spawn(dir, [], [], undefined, w);
      let immediate = '';
      try {
        w.checkWrite();
      } catch (e: any) {
        immediate = e.code;
      }
      const rejected = await spawn.catch((e: any) => e.code);
      const eof = await r.blockingRead(1n).catch((e: any) => e.code);
      const [foreign, foreignWriter] = await new HostProcessContext(
        other.getHostProcess(),
      ).io.createPipe();
      const error = await h.process.spawn(dir, [], [], foreign).catch((e: any) => e.code);
      foreignWriter.checkWrite();
      return { immediate, rejected, eof, error };
    } finally {
      await os.dispose();
      await other.dispose();
    }
  });
  expect(result).toEqual({
    immediate: 'invalid-resource',
    rejected: 'invalid-resource',
    eof: 'closed',
    error: 'invalid-resource',
  });
});
test('Clock, timer cancellation, random limits and insecure random independence', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create();
    try {
      const h = new HostProcessContext(os.getHostProcess());
      const wall = h.clock.wall.now(),
        before = h.clock.monotonic.now();
      const timer = h.clock.monotonic.subscribeDuration(2000000n);
      await timer.block();
      const elapsed = h.clock.monotonic.now() - before;
      await timer[Symbol.asyncDispose]();
      const cancelled = h.clock.monotonic.subscribeDuration(10000000000n);
      const waiting = cancelled.block().catch((e: any) => e.code);
      await cancelled[Symbol.asyncDispose]();
      const bytes = h.random.getRandomBytes(70000n);
      const limits = [];
      for (const n of [-1n, 16777217n])
        try {
          h.random.getRandomBytes(n);
        } catch (e: any) {
          limits.push(e.code);
        }
      const native = crypto.getRandomValues;
      crypto.getRandomValues = () => {
        throw new Error('injected crypto failure');
      };
      let secure = '';
      try {
        h.random.getRandomBytes(1n);
      } catch (e: any) {
        secure = e.code;
      }
      const insecure = h.random.getInsecureRandomBytes(16n).length;
      crypto.getRandomValues = native;
      return {
        wall: typeof wall.seconds === 'bigint' && wall.nanoseconds >= 0 && wall.nanoseconds < 1e9,
        resolution: h.clock.monotonic.resolution() > 0n,
        elapsed: elapsed >= 2000000n,
        cancelled: await waiting,
        length: bytes.length,
        nonzero: bytes.some((n) => n !== 0),
        limits,
        secure,
        insecure,
        seed: h.random.insecureSeed().length,
      };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({
    wall: true,
    resolution: true,
    elapsed: true,
    cancelled: 'invalid-resource',
    length: 70000,
    nonzero: true,
    limits: ['invalid', 'invalid'],
    secure: 'io',
    insecure: 16,
    seed: 2,
  });
});
for (const name of ['services-probe', 'p2-services-probe'])
  for (const pwd of [undefined, 'relative', '/missing'])
    test(`${name}: local clocks/random, copied argv/env and no eager PWD check (${pwd})`, async ({
      page,
    }) => {
      const result = await page.evaluate(
        async ({ name, pwd }) => {
          const { Walos, HostProcessContext, install, readAll } = await import(
            '/tests/fixtures/host-harness.ts'
          );
          const os = await Walos.create({ env: { HOST_ONLY: 'hidden' } });
          try {
            const h = new HostProcessContext(os.getHostProcess()),
              exe = await install(h, name);
            const [r, w] = await h.io.createPipe();
            const output = readAll(r);
            const argv = [name, 'original'];
            const env = [
              { key: 'VALUE', value: 'first' },
              { key: 'VALUE', value: 'snapshot' },
            ];
            if (pwd !== undefined) env.push({ key: 'PWD', value: pwd });
            const spawning = h.process.spawn(exe, argv, env, undefined, w);
            argv[1] = 'mutated';
            env[1].value = 'mutated';
            const child = await spawning;
            const exit = await child.wait();
            await child[Symbol.asyncDispose]();
            return { exit, output: new TextDecoder().decode(await output) };
          } finally {
            await os.dispose();
          }
        },
        { name, pwd },
      );
      expect(result.exit).toEqual({ kind: 'exited', code: 0 });
      expect(result.output).toContain('arg=original\n');
      expect(result.output).toContain('VALUE=snapshot\n');
      expect(result.output).toContain(`PWD=${pwd ?? 'missing'}\nservices-ok\n`);
    });
for (const name of ['services-probe', 'p2-services-probe'])
  test(`${name} accepts completely empty argv`, async ({ page }) => {
    const result = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        return await run(
          new HostProcessContext(os.getHostProcess()),
          await install(new HostProcessContext(os.getHostProcess()), name),
          [],
          [],
        );
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result.exit).toEqual({ kind: 'exited', code: 0 });
    expect(result.stdout).toContain('argc=0\n');
  });
test('Host output stream flush, append, lock conflicts and descriptor disposal confirmation', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, writeAll } = await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create();
    try {
      const h = new HostProcessContext(os.getHostProcess());
      const [[root]] = h.fs.getDirectories();
      const file = await root.openAt({}, 'append', { create: true }, { read: true, write: true });
      const stream = await file.appendViaStream();
      stream.checkWrite();
      await stream.write(new Uint8Array([1, 2]));
      stream.checkWrite();
      await stream.write(new Uint8Array([3, 4]));
      await stream.blockingFlush();
      const size = Number((await file.stat()).size);
      let locked = '';
      try {
        await file.writeViaStream(0n);
      } catch (e: any) {
        locked = e.code;
      }
      const closing = stream[Symbol.asyncDispose]();
      const same = closing === stream[Symbol.asyncDispose]();
      await closing;
      const [bytes] = await file.read(100n, 0n);
      await file[Symbol.asyncDispose]();
      return { size, locked, same, bytes: [...bytes] };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({ size: 4, locked: 'busy', same: true, bytes: [1, 2, 3, 4] });
});
