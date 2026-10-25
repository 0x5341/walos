import { ProcessManager } from '../../packages/os/dist/internal/core.js';
import type { CoreEvent } from '../../packages/os/dist/internal/protocol.js';

export interface Scenario {
  parent: 'lifecycle-parent' | 'p2-lifecycle-parent';
  child: 'cat' | 'p2-cat';
  reason: 'normal' | 'nonzero' | 'trap' | 'error' | 'messageerror' | 'rejection';
  order: 'exit-first' | 'ready-first' | 'same-turn-ready-first';
}

// These are native Workers. Only delivery of actual native READY/terminal events
// is held/replayed; production ProcessManager, RPC and WASI adapters stay intact.
export async function runLifecycle(scenario: Scenario) {
  const root = await navigator.storage.getDirectory();
  const bin = await root.getDirectoryHandle('bin', { create: true });
  for (const name of [scenario.parent, scenario.child]) {
    const response = await fetch(`/bin/${name}.wasm`);
    if (!response.ok) throw new Error(`missing fixture ${name}: ${response.status}`);
    const file = await bin.getFileHandle(name, { create: true });
    const writer = await file.createWritable();
    await writer.write(await response.arrayBuffer());
    await writer.close();
  }
  const events: CoreEvent[] = [];
  const inputs = new Map<number, MessagePort>();
  const outputs = new Map<number, string>();
  const ports: MessagePort[] = [];
  const workers: {
    worker: Worker;
    terminateCount: number;
    ready?: MessageEvent;
    receive?: (event: MessageEvent) => void;
    terminal?: () => void;
    repliesAfterExit: number;
    exited: boolean;
  }[] = [];
  let snapshot: Extract<CoreEvent, { type: 'processes' }>['processes'] = [];
  const until = async (predicate: () => boolean, label: string) => {
    const deadline = performance.now() + 12000;
    while (!predicate()) {
      if (performance.now() > deadline)
        throw new Error(
          `timeout: ${label}; ${JSON.stringify({ snapshot, outputs: [...outputs] })}`,
        );
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  const manager = new ProcessManager(
    (event) => {
      events.push(event);
      if (event.type === 'processes') snapshot = event.processes;
      if (event.type !== 'tty') return;
      ports.push(event.port);
      if (event.direction === 'in') inputs.set(event.pid, event.port);
      else {
        const decoder = new TextDecoder();
        event.port.onmessage = ({ data }) => {
          if (data.type === 'data')
            outputs.set(event.pid, (outputs.get(event.pid) || '') + decoder.decode(data.bytes));
        };
        event.port.start();
      }
    },
    () => {
      const worker = new Worker(new URL('./lifecycle.worker.ts', import.meta.url), {
        type: 'module',
      });
      const record: (typeof workers)[number] = {
        worker,
        terminateCount: 0,
        repliesAfterExit: 0,
        exited: false,
      };
      const index = workers.push(record) - 1;
      const terminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        record.terminateCount++;
        record.exited = true;
        terminate();
      };
      const post = worker.postMessage.bind(worker);
      worker.postMessage = (
        message,
        transfer: Transferable[] | StructuredSerializeOptions = [],
      ) => {
        if (record.exited && message.type === 'reply') record.repliesAfterExit++;
        post(message, Array.isArray(transfer) ? transfer : transfer.transfer || []);
      };
      // ProcessManager installs handlers synchronously after makeWorker returns.
      queueMicrotask(() => {
        const receive = worker.onmessage!;
        record.receive = (event) => receive.call(worker, event);
        worker.onmessage = (event) => {
          const message = event.data;
          if (message.type === 'ready') {
            record.ready = event;
            if (index === 1) return; // Hold the real child's READY at the transport boundary.
          }
          if (index === 0 && (message.type === 'exit' || message.type === 'boot-error')) {
            record.terminal = () => record.receive!(event);
            return;
          }
          record.receive!(event);
        };
        if (index === 0) {
          const fail = worker.onerror!;
          worker.onerror = (event) => {
            event.preventDefault();
            record.terminal = () => fail.call(worker, event);
          };
        }
      });
      return worker;
    },
  );
  try {
    const parentPid = await manager.spawn(
      {
        file: await bin.getFileHandle(scenario.parent),
        cwd: root,
        cwdPath: '/',
        argv: [scenario.parent, scenario.child, scenario.reason],
        env: {},
        stdio: [null, null, null],
      },
      null,
    );
    const parentWait = manager.wait(parentPid);
    await until(() => !!workers[1]?.ready, 'child initialized and emitted READY');
    const childPid = snapshot.find((p) => p.parent === parentPid)!.pid;
    const childWait = manager.wait(childPid);
    // Inspect post-await resource ownership as well as public process snapshots:
    // a READY continuation must never restore a child handle to the dead parent.
    const internals = manager as any;
    const parentRecord = internals.records.get(parentPid);
    const initialState = snapshot.find((p) => p.pid === childPid)!.state;
    const ready = () => workers[1].receive!(workers[1].ready!);
    if (scenario.order === 'ready-first') ready();
    if (['normal', 'nonzero', 'trap'].includes(scenario.reason))
      workers[0].worker.postMessage({
        type: 'audit-release-parent',
        abort: scenario.order !== 'ready-first',
      });
    else workers[0].worker.postMessage({ type: `audit-${scenario.reason}` });
    await until(() => !!workers[0].terminal, 'actual parent terminal event');
    // Same turn means no await between READY and terminal delivery. In particular,
    // the Core's awaited spawn continuation is still queued when the parent dies.
    if (scenario.order === 'same-turn-ready-first') ready();
    const survive =
      scenario.order !== 'exit-first' || ['normal', 'nonzero'].includes(scenario.reason);
    workers[0].terminal!();
    // Replay the captured native event and late READY, never a fabricated EXIT.
    workers[0].terminal!();
    workers[0].terminal!();
    workers[0].receive!(workers[0].ready!);
    if (scenario.order === 'exit-first') ready();
    const parentExit = await parentWait;
    const adopted = snapshot.find((p) => p.pid === childPid);
    if (survive) {
      const input = inputs.get(childPid)!;
      const bytes = new TextEncoder().encode('audit-child-survived\n').buffer;
      input.postMessage({ type: 'data', bytes }, [bytes]);
      input.postMessage({ type: 'close' });
    }
    const childExit = await childWait;
    if (survive)
      await until(
        () => outputs.get(childPid) === 'audit-child-survived\n',
        'surviving child output',
      );
    if (['normal', 'nonzero', 'trap'].includes(scenario.reason))
      await until(
        // puts may deliver the line and newline as separate terminal messages.
        () =>
          outputs.get(parentPid) ===
          (scenario.order === 'ready-first' ? 'audit-parent-ready\n' : 'audit-parent-failed\n'),
        'compiled parent output',
      );
    // Allow the pending spawn reply/cleanup continuations to settle before checking leaks.
    await Promise.resolve();
    return {
      initialState,
      parentExit,
      childExit,
      adopted: adopted && { state: adopted.state, parent: adopted.parent },
      parentOutput: outputs.get(parentPid) || '',
      childOutput: outputs.get(childPid) || '',
      exits: [parentPid, childPid].map(
        (pid) => events.filter((e) => e.type === 'exit' && e.pid === pid).length,
      ),
      ttyCloses: [parentPid, childPid].map(
        (pid) => events.filter((e) => e.type === 'tty-close' && e.pid === pid).length,
      ),
      terminations: workers.map((w) => w.terminateCount),
      retainedParentHandles: parentRecord.handles.size,
      ownedStreams: internals.owners.size,
      records: internals.records.size,
      repliesAfterExit: workers[0].repliesAfterExit,
      processes: snapshot,
    };
  } finally {
    manager.dispose();
    for (const port of ports) port.close();
  }
}
