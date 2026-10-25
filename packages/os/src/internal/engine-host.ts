import { componentOptions } from './component-options.js';

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

/** Adapt conventions at the engine boundary; never replace the OS's WASI host. */
export function polyengineImports(
  imports: Record<string, any>,
  suspending: <F extends CallableFunction>(fn: F) => F,
  Exception: new (payload: unknown) => Error,
) {
  const wrapped = new WeakMap<object, object>(),
    originals = new WeakMap<object, object>();
  const toHost = (v: any): any => {
    if (!v || typeof v !== 'object') return v;
    if (originals.has(v)) return originals.get(v);
    if (ArrayBuffer.isView(v)) return v;
    if (Array.isArray(v)) return v.map(toHost);
    if (Object.getPrototypeOf(v) !== Object.prototype) return v;
    if ('kind' in v) return { tag: v.kind, ...('value' in v && { val: toHost(v.value) }) };
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toHost(x)]));
  };
  const fromHost = (v: any): any => {
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v)) return v;
    if (Array.isArray(v)) return v.map(fromHost);
    if (Object.getPrototypeOf(v) === Object.prototype) {
      if ('tag' in v) return { kind: v.tag, ...('val' in v && { value: fromHost(v.val) }) };
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromHost(x)]));
    }
    let proxy = wrapped.get(v);
    if (!proxy) {
      proxy = new Proxy(v, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          return (...args: any[]) => invoke(() => value.apply(target, args.map(toHost)));
        },
      });
      wrapped.set(v, proxy!);
      originals.set(proxy!, v);
    }
    return proxy;
  };
  const fail = (e: unknown): never => {
    if (expectedError(e)) throw new Exception(fromHost(e));
    throw e;
  };
  const invoke = (fn: () => any): any => {
    try {
      const result = fn();
      return result instanceof Promise ? result.then(fromHost, fail) : fromHost(result);
    } catch (e) {
      return fail(e);
    }
  };
  const result: Record<string, any> = {};
  for (const [iface, provider] of Object.entries(imports)) {
    const out: Record<string, any> = {};
    for (const [name, fn] of Object.entries(provider)) {
      if (typeof fn !== 'function') continue;
      if (/^[A-Z]/.test(name)) {
        // The prototype supplies suspension declarations; resource identity and
        // actual dispatch remain on wrappers of the original host instances.
        const cls = function () {
          throw new Error('Host resource has no WIT constructor');
        };
        for (const member of methods(fn)) {
          const marker = () => {};
          const key = `${iface}#[method]${kebab(name).slice(1)}.${kebab(member)}`;
          Object.defineProperty(cls.prototype, member, {
            value: componentOptions.asyncMode.val.imports.includes(key)
              ? suspending(marker)
              : marker,
          });
        }
        out[name] = cls;
      } else {
        const call = (...args: any[]) => invoke(() => fn(...args.map(toHost)));
        out[name] = componentOptions.asyncMode.val.imports.includes(`${iface}#${kebab(name)}`)
          ? suspending(call)
          : call;
      }
    }
    result[`${iface}@${iface.startsWith('walos:') ? '0.1.0' : '0.2.0'}`] = out;
  }
  return result;
}

/** jsco uses verbatim WIT function names and explicit result values. */
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
