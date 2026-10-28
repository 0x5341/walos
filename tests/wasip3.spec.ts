import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
test('P3 official 0.3.2 native async CLI executes streams and futures', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, run } = await import(
      '/tests/fixtures/host-harness.ts'
    );
    const os = await Walos.create();
    try {
      const h = new HostProcessContext(os.getHostProcess());
      return await run(h, await install(h, 'p3-probe'), ['p3-probe']);
    } finally {
      await os.dispose();
    }
  });
  expect(result).toMatchObject({
    exit: { kind: 'exited', code: 0 },
    stdout: 'native-p3-0.3.2\n',
    stderr: '',
  });
});

for (const [mode, output] of [
  ['future', 'p3-future-cancelled\n'],
  ['file-process', 'p3-file-process-ok\n'],
  ['services', 'p3-services-ok\n'],
  ['fs', 'p3-fs-ok\n'],
  ['process', 'p3-process-ok\nnative-p3-0.3.2\n'],
] as const)
  test(`P3 native async ${mode}`, async ({ page }) => {
    const result = await page.evaluate(
      async ({ mode }) => {
        const { Walos, HostProcessContext, install, run, readAll } = await import(
          '/tests/fixtures/host-harness.ts'
        );
        const os = await Walos.create();
        try {
          const h = new HostProcessContext(os.getHostProcess());
          const [[root]] = h.fs.getDirectories();
          await root.createDirectoryAt('bin');
          for (const name of ['p3-probe', 'p2-cat', 'hang']) await install(h, name, `bin/${name}`);
          const exe = await install(h, 'p3-probe');
          if (mode === 'process' || mode === 'file-process') {
            const [out, writer] = await h.io.createPipe();
            const reading = readAll(out);
            const child = await h.process.spawn(
              exe,
              ['p3-probe', mode],
              [{ key: 'PWD', value: '/' }],
              undefined,
              writer,
            );
            const exit = await child.wait();
            await child[Symbol.asyncDispose]();
            return { exit, stdout: new TextDecoder().decode(await reading), stderr: '' };
          }
          return await run(
            h,
            exe,
            ['p3-probe', mode],
            [
              { key: 'PWD', value: '/' },
              { key: 'VALUE', value: 'snapshot' },
            ],
          );
        } finally {
          await os.dispose();
        }
      },
      { mode },
    );
    expect(result).toMatchObject({ exit: { kind: 'exited', code: 0 }, stdout: output, stderr: '' });
  });
for (const [mode, operation] of [
  ['fs-trap', 'wasi:filesystem/types@0.3.2/[method]descriptor.set-times'],
  ['http', 'wasi:http/types@0.3.2/[constructor]fields'],
  ['socket', 'wasi:sockets/types@0.3.2/[static]tcp-socket.create'],
  ['timezone', 'wasi:clocks/timezone@0.3.2/iana-id'],
] as const)
  test(`P3 ${mode} preserves the shared unimplemented Trap`, async ({ page }) => {
    const result = await page.evaluate(async (mode) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const h = new HostProcessContext(os.getHostProcess());
        return await run(h, await install(h, 'p3-probe'), ['p3-probe', mode]);
      } finally {
        await os.dispose();
      }
    }, mode);
    expect(result.exit.kind).toBe('trap');
    expect(result.exit).toMatchObject({ message: expect.stringContaining(operation) });
  });

for (const name of [
  'unknown-world',
  'wrong-version',
  'mixed-world',
  'unknown-import',
  'missing-run',
])
  test(`P3 rejects ${name} before READY and reclaims moved stdio`, async ({ page }) => {
    const result = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, readAll } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const h = new HostProcessContext(os.getHostProcess());
        const exe = await install(h, `p3-${name}`);
        const [out, writer] = await h.io.createPipe();
        const reading = readAll(out);
        const failed = await h.process.spawn(exe, ['invalid'], [], undefined, writer).then(
          () => false,
          (e: any) => e.code === 'startup',
        );
        return {
          failed,
          length: (await reading).length,
          processes: os.processes.map((p) => p.pid),
        };
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result).toEqual({ failed: true, length: 0, processes: [1] });
  });
for (const [mode, exit] of [
  ['false', { kind: 'exited', code: 1 }],
  ['exit130', { kind: 'exited', code: 130 }],
  ['trap', { kind: 'trap' }],
] as const)
  test(`P3 ${mode} retains its distinct exit result`, async ({ page }) => {
    const result = await page.evaluate(async (mode) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const h = new HostProcessContext(os.getHostProcess());
        return await run(h, await install(h, 'p3-probe'), ['p3-probe', mode]);
      } finally {
        await os.dispose();
      }
    }, mode);
    expect(result.exit).toMatchObject(exit);
  });
test('P3 cancels a blocked native stream and completes its Future', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, readAll } = await import(
      '/tests/fixtures/host-harness.ts'
    );
    const os = await Walos.create();
    try {
      const h = new HostProcessContext(os.getHostProcess());
      const exe = await install(h, 'p3-probe');
      const [input, producer] = await h.io.createPipe(),
        [out, writer] = await h.io.createPipe();
      const reading = readAll(out);
      const child = await h.process.spawn(exe, ['p3-probe', 'cancel'], [], input, writer);
      const exit = await child.wait();
      await child[Symbol.asyncDispose]();
      await producer[Symbol.asyncDispose]();
      return { exit, stdout: new TextDecoder().decode(await reading) };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({ exit: { kind: 'exited', code: 0 }, stdout: 'p3-input-cancelled\n' });
});
for (const mode of ['wait', 'hang'])
  test(`P3 ${mode} stop is terminated and a dropped child handle keeps running`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (mode) => {
      const { Walos, HostProcessContext, install } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const h = new HostProcessContext(os.getHostProcess()),
          exe = await install(h, 'p3-probe');
        const child = await h.process.spawn(exe, ['p3-probe', mode], []);
        const waiting = child.wait();
        await child.requestStop();
        const exit = await waiting;
        await child[Symbol.asyncDispose]();
        const dropped = await h.process.spawn(exe, ['p3-probe', mode], []);
        const pid = dropped.pid();
        await dropped[Symbol.asyncDispose]();
        return { exit, survived: os.processes.some((p) => p.pid === pid && p.state === 'RUNNING') };
      } finally {
        await os.dispose();
      }
    }, mode);
    expect(result.exit).toEqual({
      kind: 'terminated',
      message: mode === 'wait' ? 'stop requested' : 'stop grace period expired',
    });
    expect(result.survived).toBe(true);
  });

test('P3 native stdout propagates backpressure until its Pipe reader drains', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, readAll, writeAll } = await import(
      '/tests/fixtures/host-harness.ts'
    );
    const os = await Walos.create();
    try {
      const h = new HostProcessContext(os.getHostProcess()),
        exe = await install(h, 'p3-probe');
      const [input, source] = await h.io.createPipe(),
        [output, sink] = await h.io.createPipe();
      const child = await h.process.spawn(exe, ['p3-probe', 'cat'], [], input, sink);
      const expected = Uint8Array.from({ length: 1048576 }, (_, i) => i % 251);
      let finished = false;
      const writing = writeAll(source, expected).then(() => {
        finished = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const blocked = !finished;
      const reading = readAll(output);
      await writing;
      await source[Symbol.asyncDispose]();
      const bytes = await reading,
        exit = await child.wait();
      await child[Symbol.asyncDispose]();
      return {
        blocked,
        exit,
        length: bytes.length,
        equal: bytes.every((v, i) => v === expected[i]),
      };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({
    blocked: true,
    exit: { kind: 'exited', code: 0 },
    length: 1048576,
    equal: true,
  });
});
