import { test, expect } from '@playwright/test';
for (const [zone, expected] of [
  ['UTC', 0n],
  ['Asia/Tokyo', 32400000000000n],
  ['Asia/Kathmandu', 20700000000000n],
] as const) {
  test.describe(zone, () => {
    test.use({ timezoneId: zone });
    test('shared timezone returns nanoseconds and none outside Date range', async ({ page }) => {
      await page.goto('/tests/fixtures/library.html');
      const result = await page.evaluate(async () => {
        const { Walos } = await import('/packages/os/dist/index.js');
        const os = await Walos.create({
          storage: await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle('walos-v1', { create: true }),
        });
        try {
          const tz = os.getHostProcess().wasi.clocks.timezone;
          return {
            id: tz.ianaId(),
            offset: tz.utcOffset({ seconds: 1704067200n, nanoseconds: 0 })?.toString(),
            missing: tz.utcOffset({ seconds: 9223372036854775807n, nanoseconds: 0 }),
            debug: tz.toDebugString(),
          };
        } finally {
          await os.dispose();
        }
      });
      expect(result.id).toBeTruthy();
      expect(result.offset).toBe(expected.toString());
      expect(result.missing).toBeUndefined();
      expect(result.debug).toBeTruthy();
    });
  });
}

test.describe('DST', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('offset changes at the exact DST boundary', async ({ page }) => {
    await page.goto('/tests/fixtures/library.html');
    const offsets = await page.evaluate(async () => {
      const { Walos } = await import('/packages/os/dist/index.js');
      const os = await Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('walos-v1', { create: true }),
      });
      try {
        const tz = os.getHostProcess().wasi.clocks.timezone;
        return [
          { seconds: 1710053999n, nanoseconds: 999999999 },
          { seconds: 1710054000n, nanoseconds: 0 },
          { seconds: 1730613599n, nanoseconds: 999999999 },
          { seconds: 1730613600n, nanoseconds: 0 },
        ].map((t) => tz.utcOffset(t)?.toString());
      } finally {
        await os.dispose();
      }
    });
    expect(offsets).toEqual(
      [-18000n, -14400n, -14400n, -18000n].map((s) => (s * 1000000000n).toString()),
    );
  });
});

test('Intl failures return none and recover on the same Context', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('walos-v1', { create: true }),
    });
    const original = Intl.DateTimeFormat;
    try {
      const tz = os.getHostProcess().wasi.clocks.timezone;
      Intl.DateTimeFormat = function () {
        throw new Error('unavailable');
      } as any;
      const failed = [
        tz.ianaId(),
        tz.utcOffset({ seconds: 0n, nanoseconds: 0 }),
        tz.toDebugString(),
      ];
      Intl.DateTimeFormat = original;
      return { failed, recovered: typeof tz.ianaId() === 'string' };
    } finally {
      Intl.DateTimeFormat = original;
      await os.dispose();
    }
  });
  expect(result).toEqual({
    failed: [undefined, undefined, 'Timezone unavailable'],
    recovered: true,
  });
});

test.describe('historical offsets', () => {
  test.use({ timezoneId: 'Europe/Paris' });
  test('retains historical seconds and rejects non-normalized instants', async ({ page }) => {
    await page.goto('/tests/fixtures/library.html');
    const result = await page.evaluate(async () => {
      const { Walos } = await import('/packages/os/dist/index.js');
      const os = await Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('walos-v1', { create: true }),
      });
      try {
        const tz = os.getHostProcess().wasi.clocks.timezone;
        return {
          historical: tz.utcOffset({ seconds: -2208988800n, nanoseconds: 0 })?.toString(),
          beforeEpoch: tz.utcOffset({ seconds: -1n, nanoseconds: 999999999 })?.toString(),
          invalid: tz.utcOffset({ seconds: 0n, nanoseconds: 1000000000 }),
        };
      } finally {
        await os.dispose();
      }
    });
    expect(result).toEqual({
      historical: '561000000000',
      beforeEpoch: '3600000000000',
      invalid: undefined,
    });
  });
});
