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
      env: {},
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

for (const reason of ['normal', 'trap'] as const)
  for (const readyFirst of [false, true]) {
    test(`parent ${reason} exit ${readyFirst ? 'after' : 'before'} child READY`, async ({
      page,
    }) => {
      await page.goto('/');
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
            env: {},
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
      expect(result).toEqual({ cancelled: reason === 'trap' && !readyFirst, childExitCount: 1 });
    });
  }
test('startup timeout ignores late READY and releases once', async ({ page }) => {
  await page.goto('/');
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
        env: {},
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
          env: {},
          stdio: [null, null, null],
        },
        null,
      )
      .then(
        () => '',
        (e: Error) => e.message,
      );
    return { error, creationError, exits: events.filter((e) => e.type === 'exit').length };
  });
  expect(result.error).toContain('timeout');
  expect(result.exits).toBe(1);
  expect(result.creationError).toContain('SecurityError');
});
test('explicit cancellation ignores late READY and never stops a READY child', async ({ page }) => {
  await page.goto('/');
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
      env: {},
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
  await page.goto('/');
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
      env: {},
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
