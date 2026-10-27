import type { Spec } from './protocol.js';
import { connect, FileStream, type Stream } from './streams.js';
import { p3Readable, p3Writable } from './p3-io.js';
import { WasiExit } from './wasi.js';

/**
 * Initial WASI 0.3 CLI adapter. The Component Model async runtime lives in
 * jsco; stdio is backed by the same OPFS/MessagePort endpoints as P1/P2.
 *
 * Deliberately reject filesystem and other unsupported imports rather than
 * accidentally exposing jsco's unrelated in-memory VFS or browser network.
 */
export class Wasi3 {
  stopping = false;
  private streams: Stream[] = [];

  constructor(private spec: Spec) {}

  async init() {
    try {
      for (let i = 0; i < 3; i++) this.streams.push(await connect(this.spec.stdio[i]!, true));
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private checkStop = () => {
    if (this.stopping) throw new WasiExit(130);
  };

  async imports(required: string[]): Promise<Record<string, unknown>> {
    // Avoid jsco's root loader, which also references the Node-only P3 Host.
    const { createWasiP3Host } = await import('@pavelsavara/jsco/wasip3');
    const host = createWasiP3Host({
      args: [...this.spec.argv],
      env: Object.entries(this.spec.env),
      // Child PWD is not inherited or validated at spawn.
      cwd: this.spec.env.PWD,
      stdin: p3Readable(this.streams[0], this.checkStop),
      stdout: p3Writable(this.streams[1], this.checkStop),
      stderr: p3Writable(this.streams[2], this.checkStop),
    }) as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const name of required) {
      const separator = name.lastIndexOf('@');
      const iface = separator < 0 ? name : name.slice(0, separator);
      const version = separator < 0 ? '' : name.slice(separator + 1);
      if (!/^0\.3\.0(?:-rc-2026-03-15)?$/.test(version))
        throw new Error('Unsupported WASI P3 import version: ' + name);
      if (!/^wasi:(?:cli|clocks|random)\//.test(iface))
        throw new Error('WASI P3 host import not implemented by walos: ' + name);
      // jsco's P3 host may register the RC identifier; the stable 0.3.0
      // spelling is bound explicitly to the corresponding interface.
      const provider = host[name] ?? host[iface];
      if (!provider || typeof provider !== 'object')
        throw new Error('Missing WASI P3 host interface: ' + name);
      if (iface === 'wasi:cli/exit') {
        result[name] = {
          ...(provider as object),
          exit(status: { tag: string }) {
            throw new WasiExit(status.tag === 'ok' ? 0 : 1);
          },
          exitWithCode(code: number) {
            throw new WasiExit(code);
          },
        };
      } else {
        result[name] = provider;
      }
    }
    return result;
  }

  gone(id: number) {
    for (const stream of this.streams) if (stream.ref.id === id) stream.gone();
  }

  async close() {
    const streams = this.streams.splice(0);
    await Promise.allSettled(
      streams.map(async (stream) => {
        if (stream instanceof FileStream) await stream.finish();
        else stream.close();
      }),
    );
  }
}
