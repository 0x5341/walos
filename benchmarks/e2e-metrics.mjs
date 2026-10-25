import assert from 'node:assert/strict';
import { flatten, statistics } from './stats.mjs';

export const scenarios = [
  { name: 'builtin', command: 'cd .', output: '', children: 0 },
  { name: 'p1-true', command: 'true', output: '', children: 1 },
  { name: 'p2-true', command: 'p2-true', output: '', children: 1 },
  { name: 'p1-echo', command: 'echo hello', output: 'hello\n', children: 1 },
  { name: 'p2-echo', command: 'p2-echo hello', output: 'hello\n', children: 1 },
  {
    name: 'file',
    command: 'cat /home/README.md',
    output: 'TODO zebra\nhello from OPFS\nTODO apple\n',
    children: 1,
  },
  {
    name: 'pipeline',
    command: 'cat /home/README.md | grep TODO | sort',
    output: 'TODO apple\nTODO zebra\n',
    children: 3,
  },
];
export function validateSample(sample, scenario) {
  assert.equal(sample.command, scenario.command);
  assert.equal(sample.status, scenario.status ?? 0, 'Shell exit status');
  assert.equal(sample.output, scenario.output, 'Command output (local echo and prompt excluded)');
  assert.equal(sample.inputReady, true, 'Shell must own an enabled input');
  assert.equal(sample.exits.length, scenario.children, 'Every child EXIT must be observed');
  for (const child of sample.exits)
    assert.deepEqual(child.exit, { kind: 'exited', code: scenario.status ?? 0 });
  assert(sample.inputToPromptDomMs >= 0);
  assert(sample.inputToPromptFrameMs >= sample.inputToPromptDomMs);
  assert.equal(sample.inputToFirstOutputMs !== undefined, Boolean(scenario.output));
  assert.equal(sample.inputToExitMs !== undefined, Boolean(scenario.children));
}

export function analyzeTimeline(sample) {
  const events = sample.timeline;
  const one = (name, pid) =>
    events.find((e) => e.name === name && (pid === undefined || e.pid === pid));
  const checks = [];
  const edge = (from, to, label) => {
    assert(from && to, `Missing clock boundary: ${label}`);
    const deltaMs = to.at - from.at;
    assert(Number.isFinite(deltaMs), `Nonfinite clock: ${label}`);
    checks.push({ label, fromOrigin: from.origin, toOrigin: to.origin, deltaMs });
    // Cross-origin isolation enables a shared high-resolution monotonic epoch.
    // Allow quantization, reject incompatible clocks rather than repairing data.
    assert(deltaMs >= -0.25, `Worker clock causality failed (${label}): ${deltaMs} ms`);
    return deltaMs;
  };
  const metrics = {};
  for (const end of events.filter((e) => e.name === 'opfs.operation.end')) {
    const key = `opfs.${end.detail.operation}Ms`;
    metrics[key] = (metrics[key] ?? 0) + end.at - end.detail.startAt;
  }
  const shellInput = one('shell.input');
  assert(shellInput, 'Missing command-ID-correlated shell input');
  const promptWrite = [...events]
    .reverse()
    .find(
      (e) =>
        e.name === 'stream.write' &&
        e.pid === shellInput.pid &&
        e.detail.bytes > 0 &&
        e.detail.streamId === one('shell.prompt').detail.stdoutStreamId,
    );
  edge(one('ui.enter'), shellInput, 'ui-to-shell');
  edge(promptWrite, one('ui.prompt.dom'), 'shell-to-ui');
  metrics.inputToShellMs = shellInput.at - sample.inputAt;
  metrics.shellPromptToDomMs = sample.promptDomAt - promptWrite.at;
  for (const start of events.filter((e) => e.name === 'ui.dom.start')) {
    const end = events.find((e) => e.name === 'ui.dom.end' && e.at >= start.at);
    assert(end, 'Unclosed UI DOM/scroll span');
    const key = start.detail.localEcho ? 'localEchoDomAndScrollMs' : 'outputDomAndScrollMs';
    metrics[key] = (metrics[key] ?? 0) + end.at - start.at;
  }
  const sends = events.filter((e) => e.name === 'rpc.send');
  for (const send of sends) {
    const receive = events.find(
      (e) =>
        e.name === 'core.rpc.receive' &&
        e.pid === send.pid &&
        e.detail.requestId === send.detail.requestId,
    );
    edge(send, receive, `rpc/${send.detail.op}/${send.detail.requestId}`);
    const reply = events.find(
      (e) =>
        e.name === 'rpc.reply' &&
        e.pid === send.pid &&
        e.detail.requestId === send.detail.requestId,
    );
    const replySend = events.find(
      (e) =>
        e.name === 'core.rpc.reply' &&
        e.pid === send.pid &&
        e.detail.requestId === send.detail.requestId,
    );
    edge(replySend, reply, `reply/${send.detail.op}/${send.detail.requestId}`);
  }
  const children = events.filter((e) => e.name === 'core.spawn');
  const processes = children.map((spawn) => {
    const pid = spawn.pid;
    const create = one('core.worker.create', pid);
    const ready = one('core.ready.receive', pid);
    const exit = one('core.exit.receive', pid);
    edge(create, one('process.module.initialized', pid), `${pid}/module`);
    edge(one('core.start.send', pid), one('process.start.receive', pid), `${pid}/start`);
    edge(one('process.ready.send', pid), ready, `${pid}/ready`);
    edge(one('process.exit.send', pid), exit, `${pid}/exit`);
    const rpcSend = sends.find(
      (e) => e.pid === spawn.detail.parent && e.detail.requestId === spawn.detail.requestId,
    );
    const rpcReceive = events.find(
      (e) =>
        e.name === 'core.rpc.receive' &&
        e.pid === spawn.detail.parent &&
        e.detail.requestId === spawn.detail.requestId,
    );
    const result = {
      pid,
      argv: spawn.detail.argv,
      requestToCoreMs: rpcReceive.at - rpcSend.at,
      coreToStartMs: one('core.start.send', pid).at - rpcReceive.at,
      workerStartupMs: ready.at - create.at,
      startToReceiveMs: one('process.start.receive', pid).at - one('core.start.send', pid).at,
      workerCreateToModuleMs: one('process.module.initialized', pid).at - create.at,
      readyToExitMs: exit.at - ready.at,
      runMs: one('process.run.end', pid).at - one('process.run.start', pid).at,
      closeMs: one('process.close.end', pid).at - one('process.close.start', pid).at,
      exitToUiMs: sample.exits.find((e) => e.pid === pid).at - exit.at,
    };
    const loader = one('process.ready.send', pid).detail.metrics;
    for (const [key, value] of Object.entries(flatten(loader))) {
      if (key.endsWith('Ms') && !key.endsWith('AtMs') && typeof value === 'number')
        result[key] = value;
    }
    return result;
  });
  const openStarts = events.filter((e) => e.name === 'opfs.open.start');
  metrics.opfsOpenMs = openStarts.reduce((sum, start) => {
    const end = events.find(
      (e) => e.name === 'opfs.open.end' && e.pid === start.pid && e.at >= start.at,
    );
    assert(end, 'Unclosed OPFS open span');
    return sum + end.at - start.at;
  }, 0);
  metrics.shellPreparationMs = events
    .filter((e) => e.name === 'shell.prepare.start')
    .reduce(
      (sum, start) =>
        sum +
        events.find((e) => e.name === 'shell.prepare.end' && e.detail.value === start.detail.value)
          .at -
        start.at,
      0,
    );
  if (children.length) {
    const firstSend = sends.find((e) => e.detail.op === 'spawn');
    const lastExit = Math.max(
      ...events.filter((e) => e.name === 'core.exit.receive').map((e) => e.at),
    );
    // Only these outer wall-time intervals partition the critical path.
    metrics.shellToFirstSpawnMs = firstSend.at - shellInput.at;
    metrics.firstSpawnToLastExitMs = lastExit - firstSend.at;
    metrics.lastExitToPromptDomMs = sample.promptDomAt - lastExit;
  } else metrics.shellToPromptDomMs = sample.promptDomAt - shellInput.at;
  return { metrics, processes, clockChecks: checks };
}

export function summarizeE2E(samples) {
  const groups = {};
  for (const sample of samples.filter((s) => s.phase === 'retained')) {
    const key = `${sample.condition}/${sample.detailed ? 'on' : 'off'}/${sample.scenario}`;
    const group = (groups[key] ??= { attempted: 0, failed: 0, values: {} });
    group.attempted++;
    if (sample.error) {
      group.failed++;
      continue;
    }
    const metrics = { ...sample.metrics };
    for (const key of [
      'inputToPromptDomMs',
      'inputToPromptFrameMs',
      'inputToFirstOutputMs',
      'inputToExitMs',
    ]) {
      if (sample[key] !== undefined) metrics[key] = sample[key];
    }
    // Keep child durations separate; never add overlapping pipeline processes.
    [...sample.exits]
      .sort((a, b) => a.pid - b.pid)
      .forEach((child, i) => (metrics[`child${i}.durationMs`] = child.durationMs));
    sample.processes?.forEach((child, i) => {
      for (const [key, value] of Object.entries(child))
        if (typeof value === 'number' && key !== 'pid') metrics[`child${i}.${key}`] = value;
    });
    for (const [key, value] of Object.entries(metrics)) (group.values[key] ??= []).push(value);
  }
  return Object.fromEntries(
    Object.entries(groups).map(([key, group]) => [
      key,
      {
        attempted: group.attempted,
        failed: group.failed,
        metrics: Object.fromEntries(
          Object.entries(group.values).map(([key, values]) => [
            key,
            {
              ...statistics(values),
              ...(values.length >= 100 && {
                p99: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.99) - 1],
              }),
            },
          ]),
        ),
      },
    ]),
  );
}
