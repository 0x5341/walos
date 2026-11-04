/** Versioned logical namespace. Payload bytes remain local OPFS I/O. */
export type Instant = { seconds: string; nanoseconds: number };
export type NewTime = {
  tag: 'no-change' | 'now' | 'timestamp';
  val?: { seconds: bigint; nanoseconds: number };
};
export interface Node {
  id: string;
  type: 'directory' | 'regular-file' | 'symbolic-link';
  entries?: Record<string, string>;
  target?: string;
  links: number;
  atime: Instant;
  mtime: Instant;
  ctime: Instant;
  generation: number;
  dataStamp?: string;
}
export interface State {
  version: 1;
  nodes: Record<string, Node>;
}
export const now = (): Instant => {
  const ms = Date.now();
  return { seconds: String(Math.floor(ms / 1000)), nanoseconds: (ms % 1000) * 1000000 };
};
export const instant = (t: Instant) => ({ seconds: BigInt(t.seconds), nanoseconds: t.nanoseconds });
export const node = (type: Node['type']): Node => ({
  id: crypto.randomUUID(),
  type,
  links: 1,
  atime: now(),
  mtime: now(),
  ctime: now(),
  generation: 0,
  ...(type === 'directory' ? { entries: {} } : {}),
});
export class Store {
  constructor(readonly root: FileSystemDirectoryHandle) {}
  // A single origin-wide lock deliberately also serializes distinct stores. No bytes cross Core.
  async run<T>(fn: (s: State) => Promise<T> | T, write = false): Promise<T> {
    return navigator.locks.request('walos:filesystem:v1', async () => {
      let state: State;
      try {
        state = JSON.parse(
          await (await (await this.root.getFileHandle('namespace.json')).getFile()).text(),
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === 'NotFoundError')
          throw new Error('Uninitialized walos storage');
        throw e;
      }
      if (state.version !== 1 || state.nodes?.root?.type !== 'directory')
        throw new Error('Invalid walos storage format');
      this.validate(state);
      const result = await fn(state);
      if (write) await this.save(state);
      return result;
    });
  }
  private validate(s: State) {
    const fail = () => {
      throw new Error('Invalid walos storage format');
    };
    for (const [id, n] of Object.entries(s.nodes)) {
      if (
        !n ||
        n.id !== id ||
        (id !== 'root' && !/^[0-9a-f-]{36}$/.test(id)) ||
        !['directory', 'regular-file', 'symbolic-link'].includes(n.type) ||
        !Number.isSafeInteger(n.links) ||
        n.links < 0 ||
        !Number.isSafeInteger(n.generation) ||
        n.generation < 0
      )
        fail();
      for (const t of [n.atime, n.mtime, n.ctime])
        if (
          !t ||
          typeof t.seconds !== 'string' ||
          !/^-?[0-9]+$/.test(t.seconds) ||
          BigInt(t.seconds) < -0x8000000000000000n ||
          BigInt(t.seconds) > 0x7fffffffffffffffn ||
          !Number.isInteger(t.nanoseconds) ||
          t.nanoseconds < 0 ||
          t.nanoseconds >= 1e9
        )
          fail();
      if (n.type === 'directory') {
        if (!n.entries || typeof n.entries !== 'object' || Array.isArray(n.entries)) fail();
        for (const [name, child] of Object.entries(n.entries!))
          if (
            !name ||
            name === '.' ||
            name === '..' ||
            name.includes('/') ||
            name.includes('\0') ||
            !Object.hasOwn(s.nodes, child)
          )
            fail();
      } else if (
        n.entries !== undefined ||
        (n.type === 'symbolic-link' &&
          (typeof n.target !== 'string' || !n.target || n.target.includes('\0')))
      )
        fail();
    }
    const references = new Map<string, number>([['root', 1]]);
    for (const n of Object.values(s.nodes))
      for (const child of Object.values(n.entries ?? {}))
        references.set(child, (references.get(child) ?? 0) + 1);
    for (const [id, n] of Object.entries(s.nodes))
      if (n.links !== (references.get(id) ?? 0) || (n.type === 'directory' && n.links > 1)) fail();
    const visiting = new Set<string>(),
      seen = new Set<string>();
    const walk = (id: string) => {
      const n = s.nodes[id];
      if (n.type !== 'directory') return;
      if (visiting.has(id) || seen.has(id)) fail();
      visiting.add(id);
      for (const child of Object.values(n.entries!)) walk(child);
      visiting.delete(id);
      seen.add(id);
    };
    walk('root');
  }
  private async save(s: State) {
    const f = await this.root.getFileHandle('namespace.json', { create: true });
    const w = await f.createWritable();
    try {
      await w.write(JSON.stringify(s));
      await w.close();
    } catch (e) {
      await w.abort().catch(() => {});
      throw e;
    }
  }
  async initialize() {
    await navigator.locks.request('walos:filesystem:v1', async () => {
      const names: string[] = [];
      for await (const name of this.root.keys()) names.push(name);
      if (!names.length) {
        const r = node('directory');
        r.id = 'root';
        await this.root.getDirectoryHandle('objects', { create: true });
        await this.save({ version: 1, nodes: { root: r } });
      } else if (
        !names.includes('namespace.json') ||
        names.some((n) => !['namespace.json', 'objects'].includes(n))
      ) {
        throw new Error('Storage must be empty or contain a walos filesystem');
      }
    });
    // Namespace commits are atomic writable-file replacements. Payload creation precedes
    // commit; deletion is deferred until restart so open descriptors/streams survive unlink.
    await this.run(async (s) => {
      const reachable = new Set<string>();
      const visit = (id: string) => {
        if (reachable.has(id)) return;
        reachable.add(id);
        for (const child of Object.values(this.get(s, id).entries ?? {})) visit(child);
      };
      visit('root');
      for (const id of Object.keys(s.nodes)) if (!reachable.has(id)) delete s.nodes[id];
      // Dropping detached directories can remove references to a still-linked file.
      const links = new Map<string, number>([['root', 1]]);
      for (const n of Object.values(s.nodes))
        for (const child of Object.values(n.entries ?? {}))
          links.set(child, (links.get(child) ?? 0) + 1);
      for (const n of Object.values(s.nodes)) n.links = links.get(n.id) ?? 0;
      const objects = await this.root.getDirectoryHandle('objects');
      // Check referenced payloads before deleting anything from storage.
      for (const n of Object.values(s.nodes))
        if (n.type === 'regular-file') {
          const f = await (await this.file(n.id)).getFile();
          const stamp = `${f.lastModified}:${f.size}`;
          if (n.dataStamp !== undefined && stamp !== n.dataStamp) this.touch(n, true);
          n.dataStamp = stamp;
        }
      for await (const name of objects.keys()) if (!s.nodes[name]) await objects.removeEntry(name);
    }, true);
  }
  async file(id: string, create = false) {
    return (await this.root.getDirectoryHandle('objects')).getFileHandle(id, { create });
  }
  get(s: State, id: string): Node {
    const n = s.nodes[id];
    if (!n) throw 'bad-descriptor';
    return n;
  }
  touch(n: Node, data = false) {
    n.ctime = now();
    if (data) n.mtime = n.ctime;
    n.generation++;
  }
  async changed(id: string, data = false, touch = true) {
    await this.run(async (s) => {
      const n = this.get(s, id);
      if (touch) this.touch(n, data);
      if (data) {
        const f = await (await this.file(id)).getFile();
        n.dataStamp = `${f.lastModified}:${f.size}`;
      }
    }, true);
  }
  resolve(s: State, base: string, path: string, follow = true, missing = false) {
    if (path.startsWith('/')) throw 'not-permitted';
    if (!path || path.includes('\0')) throw 'invalid';
    const stack = [base];
    let parts = path.split('/');
    let hops = 0;
    let parent = base,
      name = '';
    let id: string | undefined = base;
    while (parts.length) {
      const part = parts.shift()!;
      const current = this.get(s, stack.at(-1)!);
      if (current.type !== 'directory') throw 'not-directory';
      if (!part || part === '.') {
        id = current.id;
        parent = id;
        name = '';
        continue;
      }
      if (part === '..') {
        if (stack.length === 1) throw 'not-permitted';
        stack.pop();
        id = stack.at(-1)!;
        parent = id;
        name = '';
        continue;
      }
      parent = current.id;
      name = part;
      id = Object.hasOwn(current.entries!, part) ? current.entries![part] : undefined;
      if (!id) {
        if (missing && !parts.length) return { parent, name, id: undefined };
        throw 'no-entry';
      }
      const n = this.get(s, id);
      if (n.type === 'symbolic-link' && (parts.length || follow)) {
        if (++hops > 40) throw 'loop';
        if (n.target!.startsWith('/')) throw 'not-permitted';
        parts = [...n.target!.split('/'), ...parts];
      } else {
        stack.push(id);
      }
    }
    return { parent, name, id };
  }
  setTimes(n: Node, a: NewTime, m: NewTime) {
    const time = now();
    for (const [key, value] of [
      ['atime', a],
      ['mtime', m],
    ] as const) {
      if (value.tag === 'timestamp') {
        if (
          !value.val ||
          value.val.seconds < -0x8000000000000000n ||
          value.val.seconds > 0x7fffffffffffffffn ||
          !Number.isInteger(value.val.nanoseconds) ||
          value.val.nanoseconds < 0 ||
          value.val.nanoseconds >= 1e9
        )
          throw 'invalid';
        n[key] = { seconds: String(value.val.seconds), nanoseconds: value.val.nanoseconds };
      } else if (value.tag === 'now') n[key] = time;
      else if (value.tag !== 'no-change') throw 'invalid';
    }
    if (a.tag !== 'no-change' || m.tag !== 'no-change') this.touch(n);
  }
}
