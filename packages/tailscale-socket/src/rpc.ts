import type { SocketOperation } from '@walos/os';
import type { RpcReply, TailscaleEvent } from './types.js';
export class SessionRpc {
  private next = 1;
  private pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  private closed = false;
  constructor(
    readonly port: MessagePort,
    private onEvent: (event: TailscaleEvent) => void = () => {},
  ) {
    port.onmessage = (message: MessageEvent<RpcReply>) => {
      if ('event' in message.data) {
        try {
          onEvent(message.data.event);
        } finally {
          if (message.data.event.type === 'error')
            this.close(new Error(message.data.event.message));
        }
        return;
      }
      const { id, value, error } = message.data;
      const task = this.pending.get(id);
      if (!task) return;
      this.pending.delete(id);
      if (error) task.reject(new Error(error));
      else task.resolve(value);
    };
    port.onmessageerror = () => this.close(new Error('Tailscale message decode failed'));
    port.start();
  }
  request<T>(
    op: string,
    args: Record<string, unknown> = {},
    transfer: Transferable[] = [],
  ): SocketOperation<T> {
    const id = this.next++;
    const operation = new Promise<T>((resolve, reject) => {
      if (this.closed) {
        reject(new Error('Tailscale session closed'));
        return;
      }
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      try {
        this.port.postMessage({ id, op, args }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
    return Object.assign(operation, {
      cancel: () => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        this.port.postMessage({ id: 0, op: '$cancel', args: { id } });
        pending.reject(new Error('connection-aborted'));
      },
    });
  }
  close(error = new Error('Tailscale session closed')) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.port.close();
  }
}
