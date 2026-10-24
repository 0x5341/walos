import { test, expect } from '@playwright/test';
import type { Scenario } from './fixtures/lifecycle-harness';

async function run(page: import('@playwright/test').Page, scenario: Scenario) {
  await page.goto('/tests/fixtures/library.html');
  return page.evaluate(async (scenario) => {
    const { runLifecycle } = await import('/tests/fixtures/lifecycle-harness.ts');
    return runLifecycle(scenario);
  }, scenario);
}

for (const parent of ['lifecycle-parent', 'p2-lifecycle-parent'] as const)
  for (const child of ['cat', 'p2-cat'] as const)
    for (const reason of [
      'normal',
      'nonzero',
      'trap',
      'error',
      'messageerror',
      'rejection',
    ] as const)
      for (const order of ['exit-first', 'ready-first'] as const)
        test(`real ${parent} → ${child}: ${reason}, ${order}`, async ({ page }) => {
          const result = await run(page, { parent, child, reason, order });
          const normal = reason === 'normal' || reason === 'nonzero';
          expect(result.initialState).toBe('STARTING');
          expect(result.parentExit).toMatchObject(
            normal
              ? {
                  kind: 'exited',
                  code: reason === 'normal' ? 0 : parent === 'lifecycle-parent' ? 7 : 1,
                }
              : { kind: 'trap' },
          );
          if (result.parentExit.kind === 'trap')
            expect(result.parentExit.message).toContain(
              {
                trap: 'unreachable',
                error: 'audit parent Worker error',
                messageerror: 'worker incoming message error',
                rejection: 'audit parent rejection',
              }[reason as 'trap' | 'error' | 'messageerror' | 'rejection'],
            );
          if (normal || order === 'ready-first') {
            expect(result.adopted).toEqual({ state: 'RUNNING', parent: null });
            expect(result.childExit).toEqual({ kind: 'exited', code: 0 });
            expect(result.childOutput).toBe('audit-child-survived\n');
          } else {
            expect(result.adopted).toBeUndefined();
            expect(result.childExit).toEqual({
              kind: 'terminated',
              message: 'parent abnormal exit before READY',
            });
            expect(result.childOutput).toBe('');
          }
          if (normal || reason === 'trap')
            expect(result.parentOutput).toBe(
              order === 'exit-first' ? 'audit-parent-failed\n' : 'audit-parent-ready\n',
            );
          expect(result.exits).toEqual([1, 1]);
          expect(result.ttyCloses).toEqual([1, 1]);
          expect(result.terminations).toEqual([1, 1]);
          expect(result.retainedParentHandles).toBe(0);
          expect(result.ownedStreams).toBe(0);
          expect(result.records).toBe(0);
          expect(result.repliesAfterExit).toBe(0);
          expect(result.processes).toEqual([]);
        });

for (const parent of ['lifecycle-parent', 'p2-lifecycle-parent'] as const)
  for (const child of ['cat', 'p2-cat'] as const)
    test(`real ${parent} → ${child}: READY races parent trap before spawn continuation`, async ({
      page,
    }) => {
      const result = await run(page, {
        parent,
        child,
        reason: 'trap',
        order: 'same-turn-ready-first',
      });
      expect(result.parentExit.kind).toBe('trap');
      expect(result.adopted).toEqual({ state: 'RUNNING', parent: null });
      expect(result.childExit).toEqual({ kind: 'exited', code: 0 });
      expect(result.childOutput).toBe('audit-child-survived\n');
      expect(result.exits).toEqual([1, 1]);
      expect(result.ttyCloses).toEqual([1, 1]);
      expect(result.terminations).toEqual([1, 1]);
      expect(result.retainedParentHandles).toBe(0);
      expect(result.repliesAfterExit).toBe(0);
      expect(result.ownedStreams).toBe(0);
      expect(result.records).toBe(0);
      expect(result.processes).toEqual([]);
    });
