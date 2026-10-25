import { test, expect } from '@playwright/test';

test('command IDs identify silent commands and prompt-like output through the UI', async ({
  page,
}) => {
  await page.goto('/?benchmark=e2e');
  await page.waitForFunction(() => window.walosBenchmark?.snapshot().ready);
  const cases = [
    { command: 'cd .', output: '', children: 0, status: 0 },
    { command: 'true', output: '', children: 1, status: 0 },
    { command: 'true', output: '', children: 1, status: 0 },
    { command: "echo '$ '", output: '$ \n', children: 1, status: 0 },
    { command: 'false', output: '', children: 1, status: 1 },
    {
      command: 'cat /home/README.md | grep TODO | sort',
      output: 'TODO apple\nTODO zebra\n',
      children: 3,
      status: 0,
    },
  ];
  for (const [i, scenario] of cases.entries()) {
    await page.getByLabel('Terminal input').fill(scenario.command);
    await page.getByLabel('Terminal input').press('Enter');
    await page.waitForFunction(() => Boolean(window.walosBenchmark?.snapshot().completed));
    const snapshot = await page.evaluate(() => window.walosBenchmark!.snapshot());
    expect(snapshot.error).toBeUndefined();
    const sample = snapshot.completed!;
    expect(sample.commandId).toBe(i + 1);
    expect(sample.command).toBe(scenario.command);
    expect(sample.output).toBe(scenario.output);
    expect(sample.status).toBe(scenario.status);
    expect(sample.exits).toHaveLength(scenario.children);
    expect(sample.inputReady).toBe(true);
    expect(sample.inputToPromptFrameMs).toBeGreaterThanOrEqual(sample.inputToPromptDomMs!);
    expect(sample.inputToFirstOutputMs !== undefined).toBe(Boolean(scenario.output));
    expect(sample.timeline.every((event) => event.commandId === i + 1)).toBe(true);
  }
});

test('ordinary UI does not install benchmark hooks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Terminal input')).toBeEnabled();
  expect(await page.evaluate(() => window.walosBenchmark)).toBeUndefined();
});
