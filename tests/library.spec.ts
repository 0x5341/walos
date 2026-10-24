import { test, expect, type Page } from '@playwright/test';

type WorkerCounts = { created: number; terminated: number };

// Chromium can retain a terminated Worker's DevTools target, so page.workers()
// is not a reliable count of running threads. Observe the actual browser API
// calls instead; native Workers still execute all WASI work in these tests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const counts = { created: 0, terminated: 0 };
    Object.defineProperty(window, '__walosWorkerCounts', { value: counts });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        counts.created++;
      }
      terminate() {
        counts.terminated++;
        super.terminate();
      }
    };
  });
});

async function expectWorkerCounts(page: Page, expected: WorkerCounts) {
  expect(
    await page.evaluate(
      () => (window as unknown as { __walosWorkerCounts: WorkerCounts }).__walosWorkerCounts,
    ),
  ).toEqual(expected);
}

test('public package runs real WASI pipelines without the workbench UI', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = new Walos({ binUrl: new URL('/bin', location.href) });
    let output = '';
    const states: string[] = [];
    os.subscribe((event) => {
      if (event.type === 'output') output += event.text;
      if (event.type === 'state') states.push(event.state);
    });
    const until = async (predicate: () => boolean) => {
      const deadline = Date.now() + 10000;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error(`Timed out: ${output}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    const beforeBoot = os.writeInput('echo ignored\n');
    await os.boot();
    await until(() => output.endsWith('/ $ '));
    const initialProcesses = os.processes;
    const run = async (line: string) => {
      output = '';
      if (!os.writeInput(line + '\n')) throw new Error('No foreground input');
      await until(() => output.endsWith(' $ '));
      return output;
    };
    await run('cd /home');
    const pipeline = await run('cat README.md | grep TODO | sort');
    const unicode = await run('echo こんにちは');
    await run('echo library-file > library.txt');
    const file = await run('cat library.txt');
    let duplicateBoot = '';
    try {
      await os.boot();
    } catch (error) {
      duplicateBoot = String(error);
    }
    await os.dispose();
    await os.dispose();
    return {
      beforeBoot,
      states,
      initialProcesses,
      pipeline,
      unicode,
      file,
      duplicateBoot,
      disposed: os.state,
      inputAfterDispose: os.writeInput('echo ignored\n'),
      processesAfterDispose: os.processes,
      domChildren: document.body.children.length,
    };
  });
  expect(result.beforeBoot).toBe(false);
  expect(result.states).toEqual(['booting', 'running', 'disposed']);
  expect(result.initialProcesses).toEqual([
    { pid: 1, parent: null, state: 'RUNNING', argv: ['/bin/sh'] },
  ]);
  expect(result.pipeline).toBe('TODO apple\nTODO zebra\n/home $ ');
  expect(result.unicode).toBe('こんにちは\n/home $ ');
  expect(result.file).toBe('library-file\n/home $ ');
  expect(result.duplicateBoot).toContain('Cannot boot');
  expect(result.disposed).toBe('disposed');
  expect(result.inputAfterDispose).toBe(false);
  expect(result.processesAfterDispose).toEqual([]);
  expect(result.domChildren).toBe(0);
  await expectWorkerCounts(page, { created: 1, terminated: 1 });
});

test('library interrupts a foreground process and disposes an active session', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = new Walos();
    let output = '';
    const exits: string[] = [];
    os.subscribe((event) => {
      if (event.type === 'output') output += event.text;
      if (event.type === 'exit') exits.push(event.exit.kind);
    });
    const until = async (predicate: () => boolean) => {
      const deadline = Date.now() + 10000;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for the OS');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    await os.boot();
    await until(() => output.endsWith('/ $ '));
    output = '';
    os.writeInput('hang\n');
    await until(() => os.foreground.pids.length > 0);
    os.interrupt();
    await until(() => output.endsWith('/ $ '));
    output = '';
    os.writeInput('hang\n');
    os.interrupt();
    await until(() => output.endsWith('/ $ '));
    os.writeInput('hang\n');
    await until(() => os.foreground.pids.length > 0);
    await os.dispose();
    return { exits, state: os.state, foreground: os.foreground, processes: os.processes };
  });
  expect(result.exits).toContain('terminated');
  expect(result.state).toBe('disposed');
  expect(result.foreground).toEqual({ input: null, pids: [] });
  expect(result.processes).toEqual([]);
  await expectWorkerCounts(page, { created: 1, terminated: 1 });
});

test('boot rejects and reports one error when command assets are unavailable', async ({ page }) => {
  await page.route('**/missing-bin/**', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = new Walos({ binUrl: '/missing-bin/' });
    const errors: string[] = [];
    os.subscribe((event) => {
      if (event.type === 'error') errors.push(event.error.message);
    });
    const rejection = await os.boot().then(
      () => '',
      (error: Error) => error.message,
    );
    const failedState = os.state;
    const input = os.writeInput('echo ignored\n');
    await os.dispose();
    return { errors, rejection, failedState, input, finalState: os.state };
  });
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toContain('Missing sh.wasm');
  expect(result.rejection).toBe(result.errors[0]);
  expect(result.failedState).toBe('failed');
  expect(result.input).toBe(false);
  expect(result.finalState).toBe('disposed');
  await expectWorkerCounts(page, { created: 0, terminated: 0 });
});

test('dispose cancels an in-flight bootstrap without starting a Worker', async ({ page }) => {
  await page.route('**/bin/sh.wasm', () => {});
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = new Walos();
    const events: string[] = [];
    os.subscribe((event) => events.push(event.type));
    const boot = os.boot().then(
      () => false,
      () => true,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await os.dispose();
    return { rejected: await boot, state: os.state, events };
  });
  expect(result.rejected).toBe(true);
  expect(result.state).toBe('disposed');
  expect(result.events).not.toContain('error');
  await expectWorkerCounts(page, { created: 0, terminated: 0 });
});
