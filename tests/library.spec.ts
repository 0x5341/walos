import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
for (const failure of ['construct', 'send', 'error', 'messageerror'] as const)
  test(`create rolls back partial initialization after ${failure}`, async ({ page }) => {
    const result = await page.evaluate(async (failure) => {
      const { Walos } = await import('/packages/os/dist/index.js');
      let created = 0,
        terminated = 0;
      const NativeWorker = Worker;
      const original = navigator.storage.getDirectory.bind(navigator.storage);
      let storageCalls = 0;
      navigator.storage.getDirectory = async () => {
        storageCalls++;
        return original();
      };
      (window as any).Worker = class {
        onerror: any;
        onmessageerror: any;
        onmessage: any;
        constructor() {
          if (failure === 'construct')
            throw new DOMException('injected construction', 'SecurityError');
          created++;
        }
        postMessage() {
          if (failure === 'send') throw new Error('injected send');
          queueMicrotask(() =>
            failure === 'error'
              ? this.onerror({ preventDefault() {}, message: 'injected worker error' })
              : this.onmessageerror({}),
          );
        }
        terminate() {
          terminated++;
        }
      };
      const error = await Walos.create().then(
        () => null,
        (e: any) => ({ code: e.code, name: e.name }),
      );
      (window as any).Worker = NativeWorker;
      navigator.storage.getDirectory = original;
      const os = await Walos.create();
      const processes = os.processes.length;
      await os.dispose();
      return { error, created, terminated, storageCalls, processes };
    }, failure);
    expect(result.error?.name).toBe('ServiceError');
    expect(result.created).toBe(failure === 'construct' ? 0 : 1);
    expect(result.terminated).toBe(result.created);
    expect(result.storageCalls).toBe(1);
    expect(result.processes).toBe(1);
  });
test('Core loss rejects outstanding RPCs, invalidates Host resources, and releases the Worker', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, install } = await import('/tests/fixtures/host-harness.ts');
    const NativeWorker = Worker;
    let core: Worker | undefined;
    let terminated = 0;
    (window as any).Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        core = this;
      }
      terminate() {
        terminated++;
        super.terminate();
      }
    };
    const os = await Walos.create();
    const h = os.getHostProcess();
    const errors: string[] = [];
    os.subscribe((e) => {
      if (e.type === 'error') errors.push(e.error.code);
    });
    const exe = await install(h, 'hang');
    const child = await h.process.spawn(exe, ['hang'], [{ key: 'PWD', value: '/' }]);
    const pending = child.wait().catch((e: any) => e.code);
    core!.onerror!(new ErrorEvent('error', { message: 'injected Core loss', cancelable: true }));
    const code = await pending;
    const state = os.state;
    let invalid = '';
    try {
      h.fs.getDirectories();
    } catch (e: any) {
      invalid = e.code;
    }
    const disposal = await os.dispose().then(
      () => '',
      (e: any) => e.code,
    );
    (window as any).Worker = NativeWorker;
    return { code, state, invalid, errors, terminated, disposal };
  });
  expect(result).toEqual({
    code: 'internal',
    state: 'failed',
    invalid: 'invalid-resource',
    errors: ['internal'],
    terminated: 1,
    disposal: 'internal',
  });
});
test('disposal wakes a pending pipe read, pipe write and poll without a peer', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create();
    const h = os.getHostProcess();
    const [reader, writer] = await h.io.createPipe();
    const [empty, unused] = await h.io.createPipe();
    for (let i = 0; i < 4; i++) {
      writer.checkWrite();
      await writer.write(new Uint8Array(16384));
    }
    const poll = writer.subscribe();
    const blocked = poll.block().catch((e: any) => e.code);
    const read = empty.blockingRead(1n).catch((e: any) => e.code);
    await os.dispose();
    return { blocked: await blocked, read: await read };
  });
  expect(result.blocked).toBe('invalid-resource');
  expect(['closed', 'invalid-resource']).toContain(result.read);
});

test('dispose is reentrant from a state listener and acknowledges the same completion', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    let nested: Promise<void> | undefined;
    os.subscribe((event) => {
      if (event.type === 'state' && event.state === 'disposed') nested = os.dispose();
    });
    const disposal = os.dispose();
    const same = disposal === nested;
    await disposal;
    return { same, state: os.state };
  });
  expect(result).toEqual({ same: true, state: 'disposed' });
});
