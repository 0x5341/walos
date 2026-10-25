import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});

test('cacheless engine executes repeatedly without cache hashing, OPFS or converter loading', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/jco\.js/.test(request.url())) requests.push(request.url());
  });
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/artifact-harness.ts');
    return await h.run({ clear: true, cacheless: true, loads: 2 });
  });
  expect(result).toMatchObject({ prepares: 2, storageCalls: 0, hashCalls: 0 });
  for (const load of result.results) {
    expect(load.output).toBe('prepared:1,2');
    expect(load.metrics.cache).toBe('disabled');
    for (const metric of ['keyMs', 'lookupMs', 'convertMs', 'publishMs', 'publishStatus'])
      expect(load.metrics[metric]).toBeUndefined();
  }
  expect(requests).toEqual([]);
});

test('engine-owned format and metadata persist across loads, Workers and reload; no L1 cache', async ({
  page,
}) => {
  const first = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/artifact-harness.ts');
    const unpublished = await h.run({ clear: true, loads: 2, noPersist: true });
    const cold = await h.run({ loads: 2 });
    const warm = await h.run();
    const { value, dir } = await h.manifest();
    const stages: string[] = [];
    for await (const [name] of dir.entries()) if (name.includes('-stage-')) stages.push(name);
    return { unpublished, cold, warm, manifest: value, stages };
  });
  expect(first.unpublished.prepares).toBe(2);
  expect(first.unpublished.results.map((r: any) => r.metrics.cache)).toEqual(['miss', 'miss']);
  expect(first.cold.prepares).toBe(1);
  expect(first.cold.results[0].metrics.publishStatus).toBe('saved');
  expect(first.cold.results[1].metrics.cache).toBe('opfs');
  expect(first.warm.prepares).toBe(0);
  expect(first.manifest.metadata).toEqual({ entry: 'native/runtime.cwasm', abi: 7 });
  expect(first.manifest.files.map((f: any) => f.name)).toEqual(['native/runtime.cwasm']);
  expect(first.stages).toHaveLength(1);
  await page.reload();
  const warm = await page.evaluate(async () =>
    (await import('/tests/fixtures/artifact-harness.ts')).run(),
  );
  expect(warm.prepares).toBe(0);
  expect(warm.results[0]).toMatchObject({ output: 'prepared:1,2', metrics: { cache: 'opfs' } });
});

test('keys cover content, engine, version, options, host and schema, with canonical option ordering', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { openArtifactCache, clearComponentCache, cacheSchema } = await import(
      '/packages/os/dist/internal/component-cache.js'
    );
    await clearComponentCache();
    const bytes = new Uint8Array([1, 2]);
    const identity = {
      engine: 'fixture',
      version: '1',
      options: { a: 1, b: true },
      hostRevision: 'host-1',
    };
    const base = await openArtifactCache(bytes, identity);
    await base.publish(() => ({ files: [], metadata: {} }));
    const variants = [
      await openArtifactCache(new Uint8Array([1, 3]), identity),
      ...(await Promise.all(
        [
          { ...identity, engine: 'other' },
          { ...identity, version: '2' },
          { ...identity, options: { a: 2, b: true } },
          { ...identity, hostRevision: 'host-2' },
        ].map((id) => openArtifactCache(bytes, id)),
      )),
    ];
    const same = await openArtifactCache(bytes, { ...identity, options: { b: true, a: 1 } });
    const { manifest } = await import('/tests/fixtures/artifact-harness.ts');
    const stored = await manifest();
    stored.value.schema = cacheSchema - 1;
    const writer = await stored.file.createWritable();
    await writer.write(JSON.stringify(stored.value));
    await writer.close();
    return {
      key: base.key,
      same: same.key,
      keys: variants.map((v) => v.key),
      misses: await Promise.all(variants.map(async (v) => (await v.read()) === undefined)),
      schemaMiss: (await same.read()) === undefined,
    };
  });
  expect(result.same).toBe(result.key);
  expect(new Set([result.key, ...result.keys]).size).toBe(6);
  expect(result.misses).toEqual([true, true, true, true, true]);
  expect(result.schemaMiss).toBe(true);
});

for (const corruption of [
  'metadata',
  'duplicate',
  'traversal',
  'missing',
  'hash',
  'identity',
  'stage',
  'null',
])
  test(`invalid ${corruption} is a miss and regenerates without executing cached data`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (corruption) => {
      const h = await import('/tests/fixtures/artifact-harness.ts');
      await h.run({ clear: true });
      const { value, file } = await h.manifest();
      if (corruption === 'metadata') value.metadata.abi = -1;
      if (corruption === 'duplicate') value.files.push(value.files[0]);
      if (corruption === 'traversal') value.files[0].name = '../runtime.cwasm';
      if (corruption === 'missing') value.files[0].name = 'absent.bin';
      if (corruption === 'hash') value.files[0].hash = '0'.repeat(64);
      if (corruption === 'identity') value.identity = '{}';
      if (corruption === 'stage') value.directory = '../outside';
      const writer = await file.createWritable();
      await writer.write(JSON.stringify(corruption === 'null' ? null : value));
      await writer.close();
      const next = await h.run();
      const warm = await h.run();
      const { dir } = await h.manifest();
      const stages: string[] = [];
      for await (const [name] of dir.entries()) if (name.includes('-stage-')) stages.push(name);
      return { next, warm, stages };
    }, corruption);
    expect(result.next.prepares).toBe(1);
    expect(result.next.results[0]).toMatchObject({
      output: 'prepared:1,2',
      metrics: { cache: 'miss', publishStatus: 'saved' },
    });
    expect(result.warm.prepares).toBe(0);
    expect(result.stages).toHaveLength(1);
  });

test('unsafe artifact names and collisions cannot publish or delete an existing complete entry', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { openArtifactCache, clearComponentCache } = await import(
      '/packages/os/dist/internal/component-cache.js'
    );
    await clearComponentCache();
    const cache = await openArtifactCache(new Uint8Array([7]), {
      engine: 'fixture',
      version: '1',
      options: {},
      hostRevision: '1',
    });
    await cache.publish(() => ({ files: [['valid.bin', new Uint8Array([8])]], metadata: 'valid' }));
    const invalid = [
      ['../escape'],
      ['/absolute'],
      ['a\\b'],
      ['a//b'],
      ['./alias'],
      ['https://remote'],
      ['a', 'a'],
      ['a', 'a/b'],
    ];
    const statuses = [];
    for (const names of invalid)
      statuses.push(
        (
          await cache.publish(() => ({
            files: names.map((name) => [name, new Uint8Array([1])]),
            metadata: {},
          }))
        ).publishStatus,
      );
    const stored = await cache.read();
    const { manifest } = await import('/tests/fixtures/artifact-harness.ts');
    const { dir } = await manifest();
    const stages = [];
    for await (const [name] of dir.entries()) if (name.includes('-stage-')) stages.push(name);
    return { statuses, metadata: stored?.metadata, stages };
  });
  expect(result.statuses).toEqual(Array(8).fill('failed'));
  expect(result.metadata).toBe('valid');
  expect(result.stages).toHaveLength(1);
});

test('different engine namespaces coexist and public clearing removes old and new schemas', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/artifact-harness.ts');
    const a = await h.run({ clear: true });
    const b = await h.run({ engine: 'other' });
    const again = await h.run();
    const root = await navigator.storage.getDirectory();
    const legacy = await (
      await root.getDirectoryHandle('.walos-components')
    ).getFileHandle('legacy.json', { create: true });
    const writer = await legacy.createWritable();
    await writer.write('{}');
    await writer.close();
    const { clearComponentCache } = await import('/packages/os/dist/index.js');
    await clearComponentCache();
    await clearComponentCache();
    let removed = false;
    try {
      await root.getDirectoryHandle('.walos-components');
    } catch {
      removed = true;
    }
    return { a: a.prepares, b: b.prepares, again: again.prepares, removed };
  });
  expect(result).toEqual({ a: 1, b: 1, again: 0, removed: true });
});

test('publication and stage cleanup wait for active readers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { openArtifactCache, clearComponentCache } = await import(
      '/packages/os/dist/internal/component-cache.js'
    );
    await clearComponentCache();
    const identity = { engine: 'fixture', version: '1', options: {}, hostRevision: '1' };
    const writer = await openArtifactCache(new Uint8Array([9]), identity);
    await writer.publish(() => ({ files: [['data.bin', new Uint8Array([1])]], metadata: 'old' }));
    const reader = await openArtifactCache(new Uint8Array([9]), identity);
    let unblock!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const getFile = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function () {
      if (this.name === 'data.bin') {
        entered();
        await gate;
      }
      return await getFile.call(this);
    };
    try {
      const reading = reader.read();
      await blocked;
      const publishing = writer.publish(() => ({
        files: [['data.bin', new Uint8Array([2])]],
        metadata: 'new',
      }));
      // Query until the competing request has reached the browser's lock manager.
      let queued = false;
      for (let i = 0; i < 100 && !queued; i++)
        queued = Boolean(
          (await navigator.locks.query()).pending?.some((lock) => lock.name?.endsWith(writer.key)),
        );
      unblock();
      const old = await reading;
      await publishing;
      const current = await reader.read();
      const { manifest } = await import('/tests/fixtures/artifact-harness.ts');
      const { dir } = await manifest();
      const stages = [];
      for await (const [name] of dir.entries()) if (name.includes('-stage-')) stages.push(name);
      return { queued, old: old?.files[0][1][0], current: current?.files[0][1][0], stages };
    } finally {
      unblock();
      FileSystemFileHandle.prototype.getFile = getFile;
    }
  });
  expect(result.queued).toBe(true);
  expect(result.old).toBe(1);
  expect(result.current).toBe(2);
  expect(result.stages).toHaveLength(1);
});
