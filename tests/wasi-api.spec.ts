import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const schema = JSON.parse(readFileSync(new URL('../wit/p3/api.json', import.meta.url), 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});

test('raw Context exposes every pinned WIT import and keeps exports separate', async ({ page }) => {
  const result = await page.evaluate(async (schema) => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    try {
      const context = os.getHostProcess(),
        missing: string[] = [];
      const camel = (name: string) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      for (const iface of schema.interfaces) {
        if (iface.package === 'wasi:cli' && iface.interface === 'run') continue;
        const group = iface.package.startsWith('wasi:')
          ? (context.wasi as any)[iface.package.split(':')[1]]
          : context.walos;
        const service = group?.[camel(iface.interface)];
        if (!service) {
          missing.push(`${iface.package}/${iface.interface}`);
          continue;
        }
        for (const operation of iface.operations) {
          if (typeof operation.kind === 'string') {
            if (typeof service[operation.ts] !== 'function') missing.push(operation.wit);
          } else if (
            Object.hasOwn(operation.kind, 'constructor') ||
            Object.hasOwn(operation.kind, 'static') ||
            Object.hasOwn(operation.kind, 'async-static')
          ) {
            const resource = camel(operation.wit.replace(/^\[[^\]]+\]/, '').split('.')[0]);
            if (typeof service[resource]?.[operation.ts] !== 'function')
              missing.push(operation.wit);
          }
        }
      }
      const [[root]] = context.wasi.filesystem.preopens.getDirectories();
      const fs = schema.interfaces.find(
        (i: any) => i.package === 'wasi:filesystem' && i.interface === 'types',
      );
      for (const operation of fs.operations)
        if (typeof (root as any)[operation.ts] !== 'function') missing.push(operation.wit);
      await root[Symbol.asyncDispose]();
      return {
        missing,
        same: context === os.getHostProcess(),
        legacy: ['fs', 'io', 'clock', 'random', 'env', 'args'].filter((name) => name in context),
        run: 'run' in context.wasi.cli,
      };
    } finally {
      await os.dispose();
    }
  }, schema);
  expect(result).toEqual({ missing: [], same: true, legacy: [], run: false });
});

test('raw filesystem returns WIT Results and native streams/futures', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos, createStream } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    try {
      const context = os.getHostProcess();
      const [[root]] = context.wasi.filesystem.preopens.getDirectories();
      const opened = await root.openAt(
        {},
        'p3-api-data',
        { create: true, truncate: true },
        { read: true, write: true },
      );
      if (opened.tag !== 'ok') throw new Error(opened.val.tag);
      const file = opened.val;
      const source = createStream<number>(4);
      const completed = file.writeViaStream(source.readable, 0n);
      const writing = source.writable.write(new Uint8Array([1, 2, 3, 4, 5]));
      await writing;
      source.writable.close();
      const wrote = await completed;
      const [reader, readResult] = file.readViaStream(0n);
      const data: number[] = [];
      for (;;) {
        const chunk = await reader.read(3);
        if (chunk === undefined) break;
        data.push(...Array.from(chunk));
      }
      const read = await readResult;
      const type = await file.getType();
      const missing = await root.openAt({}, 'missing', {}, {});
      await file[Symbol.asyncDispose]();
      await root[Symbol.asyncDispose]();
      return {
        wrote: wrote.tag,
        read: read.tag,
        data,
        type: type.tag === 'ok' ? type.val.tag : type.val.tag,
        missing: missing.tag === 'err' ? missing.val.tag : 'unexpected',
        thenable: typeof completed.then === 'function',
      };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({
    wrote: 'ok',
    read: 'ok',
    data: [1, 2, 3, 4, 5],
    type: 'regular-file',
    missing: 'no-entry',
    thenable: true,
  });
});

test('raw standard stdio Future completes and wrapper disposal keeps Context alive', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, createStream } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    try {
      const context = os.getHostProcess(),
        host = new HostProcessContext(context);
      const source = createStream<number>();
      const completion = context.wasi.cli.stdout.writeViaStream(source.readable);
      await source.writable.write(new Uint8Array([1, 2, 3]));
      source.writable.close();
      const status = await completion;
      const [[root]] = host.fs.getDirectories();
      await host[Symbol.asyncDispose]();
      const entries = context.wasi.cli.environment.getArguments();
      const [[raw]] = context.wasi.filesystem.preopens.getDirectories();
      const type = await raw.getType();
      await raw[Symbol.asyncDispose]();
      let invalid = '';
      try {
        await root.getType();
      } catch (error: any) {
        invalid = error.code;
      }
      return {
        status: status.tag,
        same: context === os.getHostProcess(),
        type: type.tag === 'ok' ? type.val.tag : type.val.tag,
        invalid,
        args: entries,
      };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({
    status: 'ok',
    same: true,
    type: 'directory',
    invalid: 'invalid-resource',
    args: [],
  });
});

for (const name of ['unimplemented-probe', 'p2-unimplemented-probe'])
  test(`${name} preserves the common unimplemented Trap`, async ({ page }) => {
    const result = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const context = os.getHostProcess(),
          host = new HostProcessContext(context);
        const [[root]] = context.wasi.filesystem.preopens.getDirectories();
        const file = await root.openAt({}, 'host-trap', { create: true }, { write: true });
        let operation = '',
          type = '';
        if (file.tag === 'ok')
          try {
            await file.val.setTimes({ tag: 'now' }, { tag: 'now' });
          } catch (error: any) {
            operation = error.operation;
            type = error.name;
          }
        const result = await run(host, await install(host, name), [name]);
        return { operation, type, exit: result.exit };
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result.type).toBe('UnimplementedWasiError');
    expect(result.operation).toBe('wasi:filesystem/types@0.3.2/[method]descriptor.set-times');
    expect(result.exit.kind).toBe('trap');
    if (result.exit.kind === 'trap') expect(result.exit.message).toContain(result.operation);
  });

test('HTTP, socket and timezone APIs throw from the shared Context', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    try {
      const c = os.getHostProcess();
      const result = [];
      for (const call of [
        () => c.wasi.http.types.fields.new(),
        () => c.wasi.sockets.types.tcpSocket.create('ipv4'),
        () => c.wasi.clocks.timezone.ianaId(),
      ])
        try {
          await call();
          result.push('success');
        } catch (error: any) {
          result.push({ name: error.name, operation: error.operation });
        }
      return result;
    } finally {
      await os.dispose();
    }
  });
  expect(errors).toHaveLength(3);
  for (const error of errors) expect(error).toMatchObject({ name: 'UnimplementedWasiError' });
});

test('dedicated streams apply backpressure, drain before EOF and cancel blocked producers', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { createStream } = await import('/packages/os/dist/index.js');
    const pair = createStream<number>(2);
    await pair.writable.write(new Uint8Array([1, 2]));
    let completed = false;
    const blocked = pair.writable.write(new Uint8Array([3])).then(() => {
      completed = true;
    });
    await Promise.resolve();
    const wasBlocked = !completed;
    const first = await pair.readable.read(1);
    await blocked;
    pair.writable.close();
    const values = Array.from(first!);
    for (;;) {
      const chunk = await pair.readable.read(8);
      if (!chunk) break;
      values.push(...Array.from(chunk));
    }
    const cancelled = createStream<number>(1);
    await cancelled.writable.write(new Uint8Array([1]));
    const writing = cancelled.writable.write(new Uint8Array([2])).then(
      () => false,
      () => true,
    );
    await cancelled.readable.cancel();
    return { wasBlocked, values, cancelled: await writing };
  });
  expect(result).toEqual({ wasBlocked: true, values: [1, 2, 3], cancelled: true });
});

test('dropping a raw read stream cancels pending IO and settles its completion Future', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    try {
      const [input, output] = await os.getHostProcess().walos.io.createPipe();
      const [stream, future] = input.readViaStream();
      const reading = stream.read(1);
      await stream.cancel();
      const value = await reading;
      const status = await future;
      await input[Symbol.asyncDispose]();
      await output[Symbol.asyncDispose]();
      return { ended: value === undefined, status: status.tag };
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({ ended: true, status: 'ok' });
});

test('filesystem permission failures retain the WIT read-only variant', async ({ page }) => {
  const tag = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    try {
      const [[root]] = os.getHostProcess().wasi.filesystem.preopens.getDirectories();
      const opened = await root.openAt({}, '.', { directory: true }, { read: true });
      if (opened.tag !== 'ok') throw new Error(opened.val.tag);
      const result = await opened.val.createDirectoryAt('forbidden');
      await opened.val[Symbol.asyncDispose]();
      await root[Symbol.asyncDispose]();
      return result.tag === 'err' ? result.val.tag : 'success';
    } finally {
      await os.dispose();
    }
  });
  expect(tag).toBe('read-only');
});
