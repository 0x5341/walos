import { SessionBroker } from '../../packages/tailscale-socket/dist/broker.js';
let next = 0;
const sockets = new Map<
  number,
  { local: string; remote?: string; bytes: Uint8Array[]; closed?: boolean; wake?: () => void }
>();
let notify: ((json: string) => void) | undefined;
const status = {
  state: 'Running',
  addresses: ['100.64.0.10'],
  exitNodes: [{ id: 'exit-1', name: 'test-exit', online: true }],
  exitNode: '',
  exitReady: false,
};
const runtime = {
  async call(
    op: string,
    args: Record<string, any>,
    callback?: (json: string) => void,
  ): Promise<unknown> {
    if (op === 'init') {
      notify = callback;
      return status;
    }
    if (op === 'status') return status;
    if (op === 'login') {
      notify?.(JSON.stringify({ type: 'auth-url', url: 'https://login.example.invalid/verify' }));
      return;
    }
    if (op === 'select-exit') {
      status.exitNode = args.id;
      status.exitReady = !!args.id;
      return status;
    }
    if (op === 'logout') {
      status.state = 'NeedsLogin';
      status.exitReady = false;
      return;
    }
    if (op === 'lookup') return ['100.64.0.20', 'fd7a:115c:a1e0::20'];
    if (['tcp-connect', 'tcp-listen', 'udp-bind'].includes(op)) {
      const handle = ++next;
      const local = args.address?.endsWith(':0')
        ? args.address.slice(0, -1) + (40000 + handle)
        : args.address;
      sockets.set(handle, {
        local,
        remote: op === 'tcp-connect' ? args.address : undefined,
        bytes: [],
      });
      return { handle, local, remote: op === 'tcp-connect' ? args.address : undefined };
    }
    if (op === 'close') {
      const socket = sockets.get(args.handle);
      if (socket) {
        socket.closed = true;
        socket.wake?.();
        sockets.delete(args.handle);
      }
      return;
    }
    if (op === 'dispose') {
      for (const socket of sockets.values()) {
        socket.closed = true;
        socket.wake?.();
      }
      sockets.clear();
      return;
    }
    if (op === 'cancel') return;
    const socket = sockets.get(args.handle);
    if (!socket) throw new Error('invalid-state');
    if (op === 'tcp-write' || op === 'udp-send') {
      socket.bytes.push(args.bytes);
      socket.remote = args.address ?? socket.remote;
      socket.wake?.();
      return;
    }
    if (op === 'tcp-half-close') {
      socket.closed = true;
      socket.wake?.();
      return;
    }
    if (op === 'tcp-read' || op === 'udp-receive') {
      while (!socket.bytes.length && !socket.closed)
        await new Promise<void>((resolve) => {
          socket.wake = resolve;
        });
      const bytes = socket.bytes.shift();
      if (!bytes) return null;
      return op === 'udp-receive' ? { bytes, address: socket.remote } : bytes;
    }
    throw new Error('not-supported');
  },
};
const scope = self as unknown as { onconnect: (event: MessageEvent) => void; close(): void };
const broker = new SessionBroker(
  async () => runtime,
  () => scope.close(),
);
scope.onconnect = (event) => {
  for (const port of event.ports) broker.connect(port);
};
