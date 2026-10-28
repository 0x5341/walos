import { test, expect } from '@playwright/test';

for (const format of ['p1', 'p2'] as const) {
  test(`${format} Runtime borrows the shared Context and runs only once`, async ({ page }) => {
    await page.goto('/tests/fixtures/library.html');
    const result = await page.evaluate(async (format) => {
      const { Walos } = await import('/tests/fixtures/host-harness.ts');
      const path = `/packages/os/dist/internal/${format === 'p1' ? 'wasi' : 'wasi2'}.js`;
      const module = await import(path);
      const contextModule = await import('/packages/os/dist/internal/' + 'process-context.js');
      const os = await Walos.create();
      try {
        const context = os.getHostProcess();
        const runtime = format === 'p1' ? new module.Wasi() : new module.Wasi2();
        const bytes = new Uint8Array(
          await (await fetch(`/bin/${format === 'p1' ? 'true' : 'p2-true'}.wasm`)).arrayBuffer(),
        );
        await runtime.initialize(bytes, context);
        const code = await runtime.run();
        const twice = await runtime.run().then(
          () => false,
          () => true,
        );
        const disposal = runtime[Symbol.asyncDispose]();
        const sameDisposal = disposal === runtime[Symbol.asyncDispose]();
        await disposal;
        const [[root]] = context.fs.getDirectories();
        const type = root.getType();
        await root[Symbol.asyncDispose]();
        return {
          code,
          twice,
          sameDisposal,
          type,
          sameContext: context === os.getHostProcess(),
          sharedImplementation: context instanceof contextModule.ProcessContextImpl,
        };
      } finally {
        await os.dispose();
      }
    }, format);
    expect(result).toEqual({
      code: 0,
      twice: true,
      sameDisposal: true,
      type: 'directory',
      sameContext: true,
      sharedImplementation: true,
    });
  });

  test(`${format} partial Runtime initialization cleans up without disposing Context`, async ({
    page,
  }) => {
    await page.goto('/tests/fixtures/library.html');
    const result = await page.evaluate(async (format) => {
      const { Walos } = await import('/tests/fixtures/host-harness.ts');
      const path = `/packages/os/dist/internal/${format === 'p1' ? 'wasi' : 'wasi2'}.js`;
      const module = await import(path);
      const os = await Walos.create();
      try {
        const context = os.getHostProcess();
        const runtime = format === 'p1' ? new module.Wasi() : new module.Wasi2();
        const failed = await runtime.initialize(new Uint8Array([0]), context).then(
          () => false,
          () => true,
        );
        await runtime[Symbol.asyncDispose]();
        await runtime[Symbol.asyncDispose]();
        return { failed, pwd: context.env.get('PWD') };
      } finally {
        await os.dispose();
      }
    }, format);
    expect(result).toEqual({ failed: true, pwd: '/' });
  });
}
