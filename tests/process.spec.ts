import { test, expect } from '@playwright/test';
test('supervisor disposal terminates running and starting processes once', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
    const workers: any[] = [];
    const events: any[] = [];
    const manager = new ProcessManager(
      (event) => events.push(event),
      () => {
        const worker = {
          onmessage: null as any,
          postMessage() {},
          terminated: 0,
          terminate() {
            this.terminated++;
          },
        };
        workers.push(worker);
        return worker as any;
      },
    );
    const spec = () => ({
      file: {} as any,
      cwd: {} as any,
      cwdPath: '/',
      argv: ['fixture'],
      env: { PWD: '/' },
      stdio: [null, null, null],
    });
    const boot = manager.spawn(spec(), null);
    workers[0].onmessage({ data: { type: 'ready' } });
    await boot;
    for (const id of [1, 2]) {
      workers[0].onmessage({ data: { type: 'request', id, op: 'spawn', spec: spec() } });
      if (id === 1) workers[1].onmessage({ data: { type: 'ready' } });
      await Promise.resolve();
    }
    manager.dispose();
    manager.dispose();
    for (const worker of workers) worker.onmessage({ data: { type: 'ready' } });
    await Promise.resolve();
    return {
      terminations: workers.map((worker) => worker.terminated),
      exits: events
        .filter((event) => event.type === 'exit')
        .map((event) => event.pid)
        .sort(),
      finalProcesses: events.filter((event) => event.type === 'processes').at(-1).processes,
    };
  });
  expect(result).toEqual({ terminations: [1, 1, 1], exits: [1, 2, 3], finalProcesses: [] });
});

for (const reason of ['normal', 'trap', 'error', 'messageerror'] as const)
  for (const readyFirst of [false, true]) {
    test(`parent ${reason} exit ${readyFirst ? 'after' : 'before'} child READY`, async ({
      page,
    }) => {
      await page.goto('/tests/fixtures/library.html');
      const result = await page.evaluate(
        async ({ reason, readyFirst }) => {
          const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
          const workers: any[] = [];
          const events: any[] = [];
          class WorkerDouble {
            onmessage: any;
            onerror: any;
            onmessageerror: any;
            terminated = false;
            posted: any[] = [];
            postMessage(m: any) {
              this.posted.push(m);
            }
            terminate() {
              this.terminated = true;
            }
            receive(m: any) {
              this.onmessage({ data: m });
            }
          }
          const pm = new ProcessManager(
            (e: any) => events.push(e),
            () => {
              const w = new WorkerDouble();
              workers.push(w);
              return w as any;
            },
            1000,
          );
          const spec = () => ({
            file: {} as any,
            cwd: {} as any,
            cwdPath: '/',
            argv: ['fixture'],
            env: { PWD: '/' },
            stdio: [null, null, null],
          });
          const parent = pm.spawn(spec(), null);
          workers[0].receive({ type: 'ready' });
          await parent;
          workers[0].receive({ type: 'request', id: 1, op: 'spawn', spec: spec() });
          if (readyFirst) {
            workers[1].receive({ type: 'ready' });
            await Promise.resolve();
          }
          if (reason === 'error')
            workers[0].onerror({ preventDefault() {}, message: 'parent lost' });
          else if (reason === 'messageerror') workers[0].onmessageerror({});
          else
            workers[0].receive({
              type: 'exit',
              exit:
                reason === 'normal'
                  ? { kind: 'exited', code: 7 }
                  : { kind: 'trap', message: 'fixture trap' },
            });
          if (!readyFirst) workers[1].receive({ type: 'ready' });
          await Promise.resolve();
          const cancelled = workers[1].terminated;
          if (!cancelled) {
            workers[1].receive({ type: 'exit', exit: { kind: 'exited', code: 0 } });
          }
          return {
            cancelled,
            childExitCount: events.filter((e) => e.type === 'exit' && e.pid === 2).length,
          };
        },
        { reason, readyFirst },
      );
      expect(result).toEqual({ cancelled: reason !== 'normal' && !readyFirst, childExitCount: 1 });
    });
  }
test('startup timeout ignores late READY and releases once', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
    const events: any[] = [];
    let worker: any;
    const pm = new ProcessManager(
      (e: any) => events.push(e),
      () => (worker = { postMessage() {}, terminate() {}, onmessage: null } as any),
      10,
    );
    const ready = pm.spawn(
      {
        file: {} as any,
        cwd: {} as any,
        cwdPath: '/',
        argv: [],
        env: { PWD: '/' },
        stdio: [null, null, null],
      },
      null,
    );
    const error = await ready.then(
      () => '',
      (e: Error) => e.message,
    );
    worker.onmessage({ data: { type: 'ready' } });
    worker.onmessage({ data: { type: 'exit', exit: { kind: 'exited', code: 0 } } });
    const blocked = new ProcessManager(
      () => {},
      () => {
        throw new DOMException('worker blocked', 'SecurityError');
      },
    );
    const creationError = await blocked
      .spawn(
        {
          file: {} as any,
          cwd: {} as any,
          cwdPath: '/',
          argv: [],
          env: { PWD: '/' },
          stdio: [null, null, null],
        },
        null,
      )
      .then(
        () => '',
        (e: Error) => e.message,
      );
    return {
      error,
      creationError,
      exits: events.filter((e) => e.type === 'exit').length,
    };
  });
  expect(result.error).toContain('timeout');
  expect(result.exits).toBe(1);
  expect(result.creationError).toContain('SecurityError');
});
test('explicit cancellation ignores late READY and never stops a READY child', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
    const workers: any[] = [];
    const pm = new ProcessManager(
      () => {},
      () => {
        const w: any = {
          postMessage() {},
          terminated: false,
          terminate() {
            this.terminated = true;
          },
          onmessage: null,
        };
        workers.push(w);
        return w;
      },
      1000,
    );
    const spec = () => ({
      file: {} as any,
      cwd: {} as any,
      cwdPath: '/',
      argv: [],
      env: { PWD: '/' },
      stdio: [null, null, null],
    });
    const parent = pm.spawn(spec(), null);
    workers[0].onmessage({ data: { type: 'ready' } });
    await parent;
    const cancelled = pm.spawn(spec(), 1, 11).then(
      () => '',
      (e: Error) => e.message,
    );
    pm.cancelSpawn(1, 11);
    workers[1].onmessage({ data: { type: 'ready' } });
    const survivor = pm.spawn(spec(), 1, 12);
    workers[2].onmessage({ data: { type: 'ready' } });
    await survivor;
    pm.cancelSpawn(1, 12);
    const result = { cancelled: await cancelled, terminated: workers[2].terminated };
    pm.terminate(3);
    pm.terminate(1);
    return result;
  });
  expect(result.cancelled).toContain('cancelled');
  expect(result.terminated).toBe(false);
});
test('wait consumes one exit result and dropping a live handle leaves the child running', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
    const workers: any[] = [];
    const pm = new ProcessManager(
      () => {},
      () => {
        const w: any = {
          posted: [],
          postMessage(m: any) {
            this.posted.push(m);
          },
          terminated: false,
          terminate() {
            this.terminated = true;
          },
          onmessage: null,
        };
        workers.push(w);
        return w;
      },
      1000,
    );
    const spec = () => ({
      file: {} as any,
      cwd: {} as any,
      cwdPath: '/',
      argv: [],
      env: { PWD: '/' },
      stdio: [null, null, null],
    });
    const parent = pm.spawn(spec(), null);
    workers[0].onmessage({ data: { type: 'ready' } });
    await parent;
    const child = pm.spawn(spec(), 1);
    workers[1].onmessage({ data: { type: 'ready' } });
    const pid = await child;
    const waiting = pm.wait(pid);
    const repeated = await pm.wait(pid).then(
      () => '',
      (e: Error) => e.message,
    );
    workers[1].onmessage({ data: { type: 'exit', exit: { kind: 'exited', code: 23 } } });
    const exit = await waiting;
    workers[0].onmessage({ data: { type: 'request', id: 2, op: 'spawn', spec: spec() } });
    workers[2].onmessage({ data: { type: 'ready' } });
    await new Promise((r) => setTimeout(r, 0));
    workers[0].onmessage({ data: { type: 'request', id: 3, op: 'drop', pid: 3 } });
    await Promise.resolve();
    const droppedStillRunning = !workers[2].terminated;
    pm.terminate(3);
    pm.terminate(1);
    return { exit, repeated, droppedStillRunning };
  });
  expect(result.exit).toEqual({ kind: 'exited', code: 23 });
  expect(result.repeated).toContain('consumed');
  expect(result.droppedStillRunning).toBe(true);
});

for (const failure of ['error', 'messageerror', 'send'] as const)
  for (const readyFirst of [false, true])
    test(`${failure} ${readyFirst ? 'after' : 'before'} READY releases once and settles RPCs`, async ({
      page,
    }) => {
      await page.goto('/tests/fixtures/library.html');
      const result = await page.evaluate(
        async ({ failure, readyFirst }) => {
          const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
          const workers: any[] = [],
            events: any[] = [];
          const pm = new ProcessManager(
            (event) => events.push(event),
            () => {
              const worker: any = {
                posted: [],
                terminated: 0,
                fail: false,
                postMessage(message: any) {
                  if (this.fail) throw new Error('injected send failure');
                  this.posted.push(message);
                },
                terminate() {
                  this.terminated++;
                },
                receive(message: any) {
                  this.onmessage({ data: message });
                },
              };
              workers.push(worker);
              return worker;
            },
          );
          const spec = () => ({
            file: {} as any,
            cwd: {} as any,
            cwdPath: '/',
            argv: [],
            env: { PWD: '/' },
            stdio: [null, null, null],
          });
          const boot = pm.spawn(spec(), null);
          workers[0].receive({ type: 'ready' });
          await boot;
          workers[0].receive({ type: 'request', id: 1, op: 'spawn', spec: spec() });
          const child = workers[1];
          if (readyFirst) {
            child.receive({ type: 'ready' });
            await Promise.resolve();
            workers[0].receive({ type: 'request', id: 2, op: 'wait', pid: 2 });
          }
          const fail = () => {
            if (failure === 'error')
              child.onerror({ preventDefault() {}, message: 'injected error' });
            if (failure === 'messageerror') child.onmessageerror({});
            if (failure === 'send') {
              child.fail = true;
              pm.requestStop(2);
            }
          };
          fail();
          fail();
          child.receive({ type: 'ready' });
          child.receive({ type: 'exit', exit: { kind: 'exited', code: 0 } });
          await Promise.resolve();
          await Promise.resolve();
          const reply = workers[0].posted.find(
            (message: any) => message.id === (readyFirst ? 2 : 1),
          );
          const exits = events.filter((event) => event.type === 'exit' && event.pid === 2);
          const remaining = events
            .filter((event) => event.type === 'processes')
            .at(-1)
            .processes.map((p: any) => p.pid);
          pm.dispose();
          return { reply, exits, terminated: child.terminated, remaining };
        },
        { failure, readyFirst },
      );
      expect(result.terminated).toBe(1);
      expect(result.exits).toHaveLength(1);
      expect(result.exits[0]).toMatchObject({ pid: 2, exit: { kind: 'trap' } });
      expect(result.exits[0].exit.message).toContain('worker');
      expect(result.remaining).toEqual([1]);
      if (readyFirst) expect(result.reply.value.kind).toBe('trap');
      else expect(result.reply.error.kind).toBe('startup');
    });

test('peer disappearance survives endpoint migration before READY and notification send failure', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
    const workers: any[] = [],
      events: any[] = [];
    const pm = new ProcessManager(
      (e) => events.push(e),
      () => {
        const w: any = {
          posted: [],
          terminated: 0,
          fail: false,
          postMessage(m: any) {
            if (this.fail) throw new Error('disconnected');
            this.posted.push(m);
          },
          terminate() {
            this.terminated++;
          },
          receive(m: any) {
            this.onmessage({ data: m });
          },
        };
        workers.push(w);
        return w;
      },
    );
    const spec = (stdio: any[] = [null, null, null]) => ({
      file: {} as any,
      cwd: {} as any,
      cwdPath: '/',
      argv: [],
      env: { PWD: '/' },
      stdio,
    });
    const boot = pm.spawn(spec(), null);
    workers[0].receive({ type: 'ready' });
    await boot;
    workers[0].receive({ type: 'request', id: 1, op: 'pipe' });
    const [input, output] = workers[0].posted.find((m: any) => m.id === 1).value;
    const a = pm.spawn(spec([null, output, null]), 1);
    workers[1].receive({ type: 'ready' });
    await a;
    workers[1].onmessageerror({});
    const b = pm.spawn(spec([input, null, null]), 1);
    const before = workers[2].posted.filter((m: any) => m.type === 'stream-gone').length;
    workers[2].receive({ type: 'ready' });
    await b;
    const after = workers[2].posted
      .filter((m: any) => m.type === 'stream-gone')
      .map((m: any) => m.id);
    // A failed peer notification must not interrupt the original process cleanup.
    workers[0].receive({ type: 'request', id: 2, op: 'pipe' });
    const [read, write] = workers[0].posted.find((m: any) => m.id === 2).value;
    const c = pm.spawn(spec([read, null, null]), 1);
    workers[3].receive({ type: 'ready' });
    await c;
    const d = pm.spawn(spec([null, write, null]), 1);
    workers[4].receive({ type: 'ready' });
    await d;
    const waiting = pm.wait(4);
    workers[4].fail = true;
    workers[3].onerror({ preventDefault() {}, message: 'lost peer' });
    const exit = await waiting;
    pm.dispose();
    return {
      before,
      after,
      inputId: input.id,
      exit,
      counts: workers.map((w) => w.terminated),
      exits: events
        .filter((e) => e.type === 'exit')
        .map((e) => e.pid)
        .sort(),
    };
  });
  expect(result.before).toBe(0);
  expect(result.after).toEqual([result.inputId]);
  expect(result.exit.kind).toBe('trap');
  expect(result.counts).toEqual([1, 1, 1, 1, 1]);
  expect(result.exits).toEqual([1, 2, 3, 4, 5]);
});

for (const command of ['cat', 'p2-cat'])
  for (const fault of ['error', 'messageerror', 'rejection'])
    test(`real ${command} Worker ${fault} wakes pipe reader, releases OPFS lock and preserves supervisor control`, async ({
      page,
    }) => {
      await page.goto('/tests/fixtures/library.html');
      const result = await page.evaluate(
        async ({ command, fault }) => {
          const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
          const { PortStream } = await import('/packages/os/dist/internal/streams.js');
          const root = await navigator.storage.getDirectory();
          const bin = await root.getDirectoryHandle('bin', { create: true });
          const exe = await bin.getFileHandle(command, { create: true });
          const installer = await exe.createWritable();
          await installer.write(await (await fetch(`/bin/${command}.wasm`)).arrayBuffer());
          await installer.close();
          const file = await root.getFileHandle('disappearance-lock', { create: true });
          let reader: InstanceType<typeof PortStream>;
          let pipe: any[];
          const parent: any = {
            postMessage(message: any) {
              if (message.type === 'reply') pipe = message.value;
              if (message.type === 'stream-gone') reader.gone();
            },
            terminate() {},
          };
          const workers: Worker[] = [],
            events: any[] = [];
          let first = true;
          const pm = new ProcessManager(
            (event) => {
              events.push(event);
              if (event.type === 'tty') event.port.close();
            },
            () => {
              if (first) {
                first = false;
                return parent;
              }
              const worker = new Worker('/tests/fixtures/disappearance.worker.ts', {
                type: 'module',
              });
              workers.push(worker);
              return worker;
            },
          );
          const boot = pm.spawn(
            {
              file: {} as any,
              cwd: root,
              cwdPath: '/',
              argv: [],
              env: { PWD: '/' },
              stdio: [null, null, null],
            },
            null,
          );
          parent.onmessage({ data: { type: 'ready' } });
          await boot;
          parent.onmessage({ data: { type: 'request', id: 1, op: 'pipe' } });
          reader = new PortStream(pipe![0]);
          const stdout = pipe![1];
          parent.onmessage({ data: { type: 'request', id: 2, op: 'pipe' } });
          const stdin = pipe![0],
            inputWriter = pipe![1];
          const pid = await pm.spawn(
            {
              file: await bin.getFileHandle(command),
              cwd: root,
              cwdPath: '/',
              argv: [command],
              env: { PWD: '/' },
              stdio: [
                stdin,
                stdout,
                { kind: 'file', id: 0, direction: 'out', file, position: 0, append: false },
              ],
            },
            1,
          );
          const waiting = pm.wait(pid);
          const reading = reader.read(1);
          workers[0].postMessage({ type: `inject-${fault}` });
          const exit = await waiting;
          const eof = (await reading).length;
          // Sync access handles are Worker-only; createWritable tests exclusive lock release.
          const deadline = performance.now() + 5000;
          for (;;) {
            try {
              const writable = await file.createWritable();
              await writable.close();
              break;
            } catch (error) {
              if (
                !(error instanceof DOMException) ||
                error.name !== 'NoModificationAllowedError' ||
                performance.now() >= deadline
              )
                throw error;
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
          reader.close();
          inputWriter.port.close();
          pm.dispose();
          return {
            exit,
            eof,
            exits: events.filter((e) => e.type === 'exit' && e.pid === pid).length,
          };
        },
        { command, fault },
      );
      expect(result.exit).toMatchObject({
        kind: 'trap',
        message: expect.stringContaining(
          fault === 'error'
            ? 'injected Worker disappearance'
            : fault === 'messageerror'
              ? 'incoming message error'
              : 'unhandled rejection',
        ),
      });
      expect(result.eof).toBe(0);
      expect(result.exits).toBe(1);
    });

test('abnormal reader loss wakes a capacity-blocked writer and failed READY notification rejects startup', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { ProcessManager } = await import('/packages/os/dist/internal/core.js');
    const { PortStream } = await import('/packages/os/dist/internal/streams.js');
    const workers: any[] = [],
      events: any[] = [];
    let writer: InstanceType<typeof PortStream>;
    const pm = new ProcessManager(
      (e) => events.push(e),
      () => {
        const worker: any = {
          fail: false,
          posted: [],
          terminated: 0,
          postMessage(m: any) {
            if (this.fail) throw new Error('injected READY send failure');
            this.posted.push(m);
            if (m.type === 'stream-gone') writer.gone();
          },
          terminate() {
            this.terminated++;
          },
          receive(m: any) {
            this.onmessage({ data: m });
          },
        };
        workers.push(worker);
        return worker;
      },
    );
    const spec = (stdio: any[] = [null, null, null]) => ({
      file: {} as any,
      cwd: {} as any,
      cwdPath: '/',
      argv: [],
      env: { PWD: '/' },
      stdio,
    });
    const boot = pm.spawn(spec(), null);
    workers[0].receive({ type: 'ready' });
    await boot;
    workers[0].receive({ type: 'request', id: 1, op: 'pipe' });
    const [input, output] = workers[0].posted.find((m: any) => m.id === 1).value;
    writer = new PortStream(output);
    const child = pm.spawn(spec([input, null, null]), 1);
    workers[1].receive({ type: 'ready' });
    await child;
    for (let i = 0; i < 4; i++) await writer.write(new Uint8Array(16384));
    let settled = false;
    const writing = writer.write(new Uint8Array(1)).then(
      () => 0,
      (e: any) => {
        settled = true;
        return e.errno;
      },
    );
    await Promise.resolve();
    const blocked = !settled;
    workers[1].onmessageerror({});
    const errno = await writing;
    writer.close();
    workers[0].receive({ type: 'request', id: 2, op: 'pipe' });
    const [read, write] = workers[0].posted.find((m: any) => m.id === 2).value;
    const a = pm.spawn(spec([null, write, null]), 1);
    workers[2].receive({ type: 'ready' });
    await a;
    workers[2].onmessageerror({});
    const b = pm.spawn(spec([read, null, null]), 1).then(
      () => '',
      (e: any) => e.kind,
    );
    workers[3].fail = true;
    workers[3].receive({ type: 'ready' });
    workers[3].receive({ type: 'ready' });
    const startup = await b;
    pm.dispose();
    return { blocked, errno, startup, terminations: workers.map((w) => w.terminated) };
  });
  expect(result).toEqual({
    blocked: true,
    errno: 64,
    startup: 'startup',
    terminations: [1, 1, 1, 1],
  });
});
