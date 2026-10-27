const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const fallible = (iface: string, resource: string, name: string) =>
  (iface === 'wasi:filesystem/types' &&
    ['Descriptor', 'DirectoryEntryStream'].includes(resource) &&
    name !== 'isSameObject') ||
  (iface === 'wasi:io/streams' && name !== 'subscribe') ||
  (iface === 'walos:runtime/process' && ['spawn', 'wait'].includes(name));
const expectedError = (e: unknown) =>
  typeof e === 'string' || (e !== null && typeof e === 'object' && Object.hasOwn(e, 'tag'));
const methods = (cls: Function) => {
  const names = new Set<string>();
  for (let p = cls.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
    for (const name of Object.getOwnPropertyNames(p))
      if (
        name !== 'constructor' &&
        typeof Object.getOwnPropertyDescriptor(p, name)?.value === 'function'
      )
        names.add(name);
  return [...names];
};

export function jscoImports(imports: Record<string, any>, required: string[]) {
  const result: Record<string, any> = {};
  const decorate = (v: any): any => {
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v)) return v;
    if (Array.isArray(v)) return v.map(decorate);
    if (Object.getPrototypeOf(v) === Object.prototype)
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decorate(x)]));
    // jsco calls .drop() when a canonical resource handle is destroyed.
    if (typeof v[Symbol.dispose] === 'function' && !Object.hasOwn(v, 'drop'))
      Object.defineProperty(v, 'drop', { value: () => v[Symbol.dispose](), configurable: true });
    return v;
  };
  const bind =
    (fn: Function, isResult: boolean) =>
    (...args: any[]) => {
      const ok = (value: unknown) =>
        isResult ? { tag: 'ok', val: decorate(value) } : decorate(value);
      const fail = (error: unknown) => {
        if (isResult && expectedError(error)) return { tag: 'err', val: decorate(error) };
        throw error;
      };
      try {
        const value = fn(...args);
        return value instanceof Promise ? value.then(ok, fail) : ok(value);
      } catch (error) {
        return fail(error);
      }
    };
  for (const versioned of required) {
    const iface = versioned.split('@')[0],
      provider = imports[iface];
    if (!provider) {
      if (!iface.startsWith('wasi:sockets/'))
        throw new Error(`Unsupported component import: ${versioned}`);
      // wasi-sdk includes unreachable socket imports. Jco eliminates these;
      // direct runtimes link trapping placeholders. No network host is provided.
      result[versioned] = new Proxy(
        {},
        {
          get: (_target, name) => () => {
            throw new Error(`Unsupported host import: ${versioned}/${String(name)}`);
          },
        },
      );
      continue;
    }
    const out: Record<string, any> = {};
    for (const [name, fn] of Object.entries(provider)) {
      if (typeof fn !== 'function') continue;
      if (/^[A-Z]/.test(name)) {
        const resource = kebab(name).slice(1);
        for (const member of methods(fn))
          out[`[method]${resource}.${kebab(member)}`] = bind(
            (self: any, ...args: any[]) => {
              if (
                (name === 'OutputStream' && ['write', 'blockingWriteAndFlush'].includes(member)) ||
                (name === 'Descriptor' && member === 'write')
              )
                args[0] = new Uint8Array(args[0]);
              return self[member](...args);
            },
            fallible(iface, name, member),
          );
      } else out[kebab(name)] = bind(fn, fallible(iface, '', name));
    }
    result[versioned] = out;
  }
  return result;
}
