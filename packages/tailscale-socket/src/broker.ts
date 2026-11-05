import type { RemoteRuntime, RemoteSocket, RpcRequest, TailscaleEvent } from './types.js';
interface Client {
  port: MessagePort;
  authenticated: boolean;
  owner: boolean;
  closed: boolean;
  seen: number;
  handles: Map<number, 'tcp' | 'udp' | 'listener'>;
  tasks: Map<number, { operation: number; handle?: number; cancelled: boolean }>;
}
/** One node, isolated resource ownership per port, and leases for killed Workers. */
export class SessionBroker {
  private clients = new Set<Client>();
  private session?: string;
  private capability?: string;
  private runtime?: RemoteRuntime;
  private initializing?: Promise<unknown>;
  private next = 1;
  private closed = false;
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private load: (
      wasm: string,
      runtime: string,
      onExit?: (error: Error) => void,
    ) => Promise<RemoteRuntime>,
    private onClose = () => {},
    private leaseMs = 120000,
  ) {
    this.timer = setInterval(
      () => {
        void this.sweep();
      },
      Math.min(5000, leaseMs),
    );
  }
  connect(port: MessagePort) {
    const client: Client = {
      port,
      authenticated: false,
      owner: false,
      closed: false,
      seen: Date.now(),
      handles: new Map(),
      tasks: new Map(),
    };
    this.clients.add(client);
    port.onmessage = (event: MessageEvent<RpcRequest>) => {
      void this.receive(client, event.data);
    };
    port.onmessageerror = () => {
      void this.detach(client);
    };
    port.start();
  }
  private async receive(client: Client, request: RpcRequest) {
    if (client.closed || this.closed) return;
    try {
      if (
        !request ||
        !Number.isSafeInteger(request.id) ||
        typeof request.op !== 'string' ||
        !request.args ||
        typeof request.args !== 'object'
      )
        throw new Error('invalid-argument');
      client.seen = Date.now();
      const value = await this.dispatch(client, request);
      if (!client.closed) {
        const transfer = value instanceof Uint8Array ? [value.buffer] : [];
        client.port.postMessage({ id: request.id, value }, transfer);
      }
      if (request.op === '$detach' || request.op === '$connect') await this.detach(client);
      if (request.op === '$dispose-session') {
        await this.dispose();
      }
    } catch (error) {
      if (!client.closed)
        client.port.postMessage({
          id: request.id,
          error: String(error instanceof Error ? error.message : error),
        });
    }
  }
  private notify(event: TailscaleEvent) {
    for (const client of this.clients)
      if (client.owner && !client.closed) client.port.postMessage({ event });
  }
  private async dispatch(client: Client, request: RpcRequest): Promise<unknown> {
    const { op, args, id } = request;
    if (op === '$initialize') {
      if (this.initializing || this.session) throw new Error('already-initialized');
      if (
        typeof args.session !== 'string' ||
        typeof args.capability !== 'string' ||
        args.capability.length < 32 ||
        typeof args.wasm !== 'string' ||
        typeof args.runtime !== 'string'
      )
        throw new Error('invalid-argument');
      this.session = args.session;
      this.capability = args.capability;
      client.owner = client.authenticated = true;
      this.initializing = (async () => {
        this.runtime = await this.load(args.wasm as string, args.runtime as string, (error) => {
          this.notify({ type: 'error', message: error.message });
          void this.dispose().catch(() => {});
        });
        if (this.closed) throw new Error('Tailscale session closed');
        return this.runtime.call(
          'init',
          { hostname: args.hostname, authKey: args.authKey, controlURL: args.controlURL },
          (json) => this.notify(JSON.parse(json) as TailscaleEvent),
        );
      })();
      return await this.initializing;
    }
    if (op === '$connect') {
      if (
        args.session !== this.session ||
        args.capability !== this.capability ||
        !(args.port instanceof MessagePort)
      )
        throw new Error('access-denied');
      await this.initializing;
      this.connect(args.port);
      return;
    }
    if (op === '$attach') {
      if (
        args.session !== this.session ||
        args.capability !== this.capability ||
        !this.initializing
      )
        throw new Error('access-denied');
      await this.initializing;
      client.authenticated = true;
      return this.invoke('status', {});
    }
    if (!client.authenticated) throw new Error('access-denied');
    if (op === '$heartbeat' || op === '$detach') return;
    if (op === '$dispose-session') {
      if (!client.owner) throw new Error('access-denied');
      return;
    }
    if (op === '$cancel') {
      const task = client.tasks.get(Number(args.id));
      if (task) {
        task.cancelled = true;
        await this.runtime?.call('cancel', { operation: task.operation });
        if (task.handle !== undefined) await this.release(client, task.handle);
      }
      return;
    }
    if (['login', 'logout', 'select-exit'].includes(op) && !client.owner)
      throw new Error('access-denied');
    if (
      ![
        'status',
        'login',
        'logout',
        'select-exit',
        'lookup',
        'tcp-connect',
        'tcp-listen',
        'tcp-accept',
        'tcp-read',
        'tcp-write',
        'tcp-half-close',
        'udp-bind',
        'udp-send',
        'udp-receive',
        'close',
      ].includes(op)
    )
      throw new Error('not-supported');
    const required =
      op.startsWith('tcp-') && !['tcp-connect', 'tcp-listen'].includes(op)
        ? op === 'tcp-accept'
          ? 'listener'
          : 'tcp'
        : op.startsWith('udp-') && op !== 'udp-bind'
          ? 'udp'
          : undefined;
    const handle = args.handle as number | undefined;
    if (
      (required || op === 'close') &&
      (!Number.isSafeInteger(handle) ||
        !client.handles.has(handle!) ||
        (required && client.handles.get(handle!) !== required))
    )
      throw new Error('invalid-state');
    if (
      op === 'tcp-read' &&
      (!Number.isInteger(args.maximum) || Number(args.maximum) < 1 || Number(args.maximum) > 65536)
    )
      throw new Error('invalid-argument');
    if (op === 'tcp-write' || op === 'udp-send') {
      if (
        !(args.bytes instanceof Uint8Array) ||
        args.bytes.length > (op === 'tcp-write' ? 65536 : 65507)
      )
        throw new Error('datagram-too-large');
    }
    if (
      client.tasks.size >= 64 ||
      (client.handles.size >= 1024 &&
        ['tcp-connect', 'tcp-listen', 'tcp-accept', 'udp-bind'].includes(op))
    )
      throw new Error('out-of-memory');
    const task = { operation: this.next++, handle, cancelled: false };
    client.tasks.set(id, task);
    try {
      const value = await this.runtime!.call(op, { ...args, operation: task.operation });
      if (['tcp-connect', 'tcp-listen', 'tcp-accept', 'udp-bind'].includes(op)) {
        const socket = value as RemoteSocket;
        if (client.closed || task.cancelled || this.closed) {
          await this.invoke('close', { handle: socket.handle });
          throw new Error('connection-aborted');
        }
        client.handles.set(
          socket.handle,
          op === 'tcp-listen' ? 'listener' : op === 'udp-bind' ? 'udp' : 'tcp',
        );
      }
      if (op === 'close') client.handles.delete(handle!);
      if (task.cancelled) throw new Error('connection-aborted');
      return value;
    } finally {
      client.tasks.delete(id);
    }
  }
  private invoke(op: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.runtime) return Promise.reject(new Error('not-initialized'));
    return this.runtime.call(op, { ...args, operation: this.next++ });
  }
  private async release(client: Client, handle: number) {
    client.handles.delete(handle);
    await this.invoke('close', { handle }).catch(() => {});
  }
  private async detach(client: Client) {
    if (client.closed) return;
    try {
      client.port.postMessage({ event: { type: 'error', message: 'Tailscale transport closed' } });
    } catch {}
    client.closed = true;
    await Promise.allSettled(
      [...client.tasks.values()].map((task) =>
        this.runtime?.call('cancel', { operation: task.operation }),
      ),
    );
    await Promise.allSettled(
      [...client.handles.keys()].map((handle) => this.release(client, handle)),
    );
    client.tasks.clear();
    client.port.close();
    this.clients.delete(client);
    if (client.owner) await this.dispose();
  }
  async sweep(now = Date.now()) {
    await Promise.allSettled(
      [...this.clients]
        .filter((client) => now - client.seen > this.leaseMs)
        .map((client) => this.detach(client)),
    );
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    await Promise.allSettled([...this.clients].map((client) => this.detach(client)));
    try {
      if (this.runtime) await this.invoke('dispose', {});
    } finally {
      this.onClose();
    }
  }
}
