import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});

for (const name of ['p2-cat', 'p3-cat'])
  test(`${name} reads file operands, relative paths and reports errors without losing later files`, async ({
    page,
  }) => {
    const results = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const host = new HostProcessContext(os.getHostProcess());
        const [[root]] = host.fs.getDirectories();
        await root.createDirectoryAt('home');
        const first = '日本語\0file-data\n'.repeat(600);
        for (const [path, text] of [
          ['home/first', first],
          ['home/empty', ''],
          ['second', 'second-file\n'],
          ['home/名前', 'unicode-name\n'],
          ['-named', 'dash-file\n'],
        ]) {
          const file = await root.openAt({}, path, { create: true }, { write: true });
          await file.write(new TextEncoder().encode(text), 0n);
          await file[Symbol.asyncDispose]();
        }
        const exe = await install(host, name);
        const cases = [
          { args: ['/home/first'], pwd: '/', out: first },
          { args: ['first'], pwd: '/home', out: first },
          { args: ['../second'], pwd: '/home', out: 'second-file\n' },
          {
            args: ['/home/empty', '/home/first', '/second'],
            pwd: '/',
            out: first + 'second-file\n',
          },
          { args: ['名前'], pwd: '/home', out: 'unicode-name\n' },
          { args: ['-u', '/second'], pwd: '/', out: 'second-file\n' },
          { args: ['--', '-named'], pwd: '/', out: 'dash-file\n' },
          {
            args: ['/missing-input', '/second'],
            pwd: '/',
            out: 'second-file\n',
            error: 'missing-input',
          },
          { args: ['/home'], pwd: '/', out: '', error: 'home' },
        ];
        const results = [];
        for (const scenario of cases) {
          const actual = await run(
            host,
            exe,
            [`/bin/${name}`, ...scenario.args],
            [{ key: 'PWD', value: scenario.pwd }],
          );
          results.push({
            args: scenario.args,
            match: actual.stdout === scenario.out,
            exit: actual.exit,
            stderr: actual.stderr,
            error: scenario.error,
          });
        }
        return results;
      } finally {
        await os.dispose();
      }
    }, name);
    for (const result of results) {
      expect(result.match).toBe(true);
      expect(result.exit, JSON.stringify(result)).toEqual({
        kind: 'exited',
        code: result.error ? 1 : 0,
      });
      if (result.error) expect(result.stderr).toContain(result.error + ':');
      else expect(result.stderr).toBe('');
    }
  });

test('p3-cat preserves every byte of a large file through a backpressured output Pipe', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, readAll, writeAll } = await import(
      '/tests/fixtures/host-harness.ts'
    );
    const os = await Walos.create();
    try {
      const host = new HostProcessContext(os.getHostProcess());
      const [[root]] = host.fs.getDirectories();
      const bytes = Uint8Array.from({ length: 1048576 }, (_, i) => i % 256);
      const file = await root.openAt({}, 'binary-input', { create: true }, { write: true });
      const sink = await file.writeViaStream(0n);
      await writeAll(sink, bytes);
      await sink[Symbol.asyncDispose]();
      await file[Symbol.asyncDispose]();
      const [out, writer] = await host.io.createPipe();
      const child = await host.process.spawn(
        await install(host, 'p3-cat'),
        ['p3-cat', '/binary-input'],
        [],
        undefined,
        writer,
      );
      // Delay draining the reader to exercise native stdout backpressure.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const reading = readAll(out);
      const exit = await child.wait();
      const actual = await reading;
      await child[Symbol.asyncDispose]();
      return { exit, length: actual.length, equal: actual.every((b, i) => b === bytes[i]) };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({ exit: { kind: 'exited', code: 0 }, length: 1048576, equal: true });
});

for (const args of [[], ['-'], ['/before', '-', '/after']])
  test(`p3-cat preserves stdin with operands ${JSON.stringify(args)}`, async ({ page }) => {
    const result = await page.evaluate(async (args) => {
      const { Walos, HostProcessContext, install, readAll, writeAll } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const host = new HostProcessContext(os.getHostProcess());
        const [[root]] = host.fs.getDirectories();
        for (const path of ['before', 'after']) {
          const file = await root.openAt({}, path, { create: true }, { write: true });
          await file.write(new TextEncoder().encode(path + '\n'), 0n);
          await file[Symbol.asyncDispose]();
        }
        const [input, producer] = await host.io.createPipe(),
          [out, sink] = await host.io.createPipe();
        const reading = readAll(out);
        const child = await host.process.spawn(
          await install(host, 'p3-cat'),
          ['p3-cat', ...args],
          [],
          input,
          sink,
        );
        await writeAll(producer, new TextEncoder().encode('stdin-data\n'));
        await producer[Symbol.asyncDispose]();
        const exit = await child.wait();
        await child[Symbol.asyncDispose]();
        return { exit, stdout: new TextDecoder().decode(await reading) };
      } finally {
        await os.dispose();
      }
    }, args);
    expect(result).toEqual({
      exit: { kind: 'exited', code: 0 },
      stdout: args.length > 1 ? 'before\nstdin-data\nafter\n' : 'stdin-data\n',
    });
  });
