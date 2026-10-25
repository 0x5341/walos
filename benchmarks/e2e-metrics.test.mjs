import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTimeline, scenarios, summarizeE2E, validateSample } from './e2e-metrics.mjs';

const empty = () => ({
  command: 'true',
  status: 0,
  output: '',
  inputReady: true,
  inputToPromptDomMs: 10,
  inputToPromptFrameMs: 12,
  inputToExitMs: 9,
  exits: [{ pid: 2, at: 9, exit: { kind: 'exited', code: 0 }, durationMs: 8 }],
});
test('silent commands require EXIT and readiness, and exclude prompt/local echo', () => {
  const scenario = scenarios.find((s) => s.name === 'p1-true');
  validateSample(empty(), scenario);
  for (const override of [
    { output: 'true\n/ $ ' },
    { exits: [] },
    { inputReady: false },
    { inputToFirstOutputMs: 1 },
  ]) {
    assert.throws(() => validateSample({ ...empty(), ...override }, scenario));
  }
});
test('pipeline validates every child, including failed upstream processes', () => {
  const scenario = scenarios.find((s) => s.name === 'pipeline');
  const sample = {
    ...empty(),
    command: scenario.command,
    output: scenario.output,
    inputToFirstOutputMs: 2,
    exits: [2, 3, 4].map((pid) => ({
      pid,
      at: 9,
      exit: { kind: 'exited', code: 0 },
      durationMs: 8,
    })),
  };
  validateSample(sample, scenario);
  sample.exits[0].exit.code = 1;
  assert.throws(() => validateSample(sample, scenario));
});
test('cross-worker causal violations and missing boundaries fail the sample', () => {
  const event = (name, at, detail = {}) => ({
    name,
    at,
    pid: 1,
    origin: 1000,
    commandId: 1,
    detail,
  });
  const sample = {
    inputAt: 1000,
    promptDomAt: 1010,
    timeline: [
      event('ui.enter', 1000),
      event('shell.input', 1001),
      event('shell.prompt', 1011, { stdoutStreamId: 2 }),
      event('stream.write', 1008, { bytes: 4, streamId: 2 }),
      event('ui.prompt.dom', 1010),
      event('rpc.send', 1002, { op: 'foreground', requestId: 1 }),
      event('core.rpc.reply', 1004, { op: 'foreground', requestId: 1 }),
      event('rpc.reply', 1005, { requestId: 1 }),
      event('core.rpc.receive', 1003, { op: 'foreground', requestId: 1 }),
    ],
  };
  assert.equal(analyzeTimeline(sample).clockChecks.length, 4);
  sample.timeline.at(-1).at = 900;
  assert.throws(() => analyzeTimeline(sample), /clock causality/);
  sample.timeline.pop();
  assert.throws(() => analyzeTimeline(sample), /Missing clock boundary/);
});
test('failed attempts stay in counts and never become timing observations', () => {
  const base = {
    scenario: 'p1-true',
    condition: 'warm',
    detailed: true,
    phase: 'retained',
    ...empty(),
  };
  const summary = summarizeE2E([base, { ...base, error: 'timeout' }, { ...base, phase: 'warmup' }]);
  const group = summary['warm/on/p1-true'];
  assert.equal(group.attempted, 2);
  assert.equal(group.failed, 1);
  assert.equal(group.metrics.inputToPromptDomMs.n, 1);
});
