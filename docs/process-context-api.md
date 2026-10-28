# ProcessContext API (WASI 0.3.2)

`Walos.create()` registers one logical Host in Main Thread. Repeated
`getHostProcess()` calls return its identical raw `ProcessContextImpl` instance.
The public API follows the official WASI v0.3.2 WIT pinned at
`bdadbbb8cadd287cc5014c4b5a0bf76efc60291c`; `wit/p3/api.json` contains the full
interface/function/type mapping. `npm run check:wasi` checks source hashes and
regenerates this projection for comparison.

```ts
await using os = await Walos.create();
const context = os.getHostProcess();
const [[root]] = context.wasi.filesystem.preopens.getDirectories();
const result = await root.openAt({}, 'file', {}, { read: true });
if (result.tag === 'ok') {
  const [stream, completion] = result.val.readViaStream(0n);
  for (;;) {
    const bytes = await stream.read(65536);
    if (bytes === undefined) break;
    // ArrayLike<number>; byte channels commonly provide Uint8Array batches.
  }
  const status = await completion;
  await result.val[Symbol.asyncDispose]();
}
await root[Symbol.asyncDispose]();
```

## WIT to TypeScript

| WIT | Public TS mapping |
| --- | --- |
| `wasi:PACKAGE/INTERFACE@0.3.2` import | `context.wasi.package.interface` |
| `walos:runtime/INTERFACE@0.3.2` import | `context.walos.interface` |
| kebab names | camelCase; named types use PascalCase namespaces |
| `wasi:cli/run` export | `WasiCliRun.Interface`, called by Runtime; absent from Context imports |
| `func` | synchronous call, including when returning future/stream values |
| `async func` | `Promise<T>` |
| `result<T,E>` | `{tag:'ok', val:T} \| {tag:'err', val:E}` |
| `option<T>` | `T \| undefined` |
| tuple/list/record | readonly tuple/array/fields; `list<u8>` uses Uint8Array |
| enum/variant | strings / tagged unions, preserving optional payloads |
| flags | optional boolean fields |
| u8/u16/u32/s8/s16/s32/f32/f64 | named number aliases, with the WIT width/range contract |
| u64/s64 | bigint |
| `own<T>` / `borrow<T>` | Own/Borrow type aliases and documented transfer/lifetime responsibility |
| resource | interface with AsyncDisposable; methods follow the WIT async/result signatures |
| resource constructor / static | interface resource factory (`fields.new()`, `tcpSocket.create()`) |
| `future<T>` | dedicated Thenable `Future<T>` |
| `stream<T>` | dedicated owned readable `Stream<T>` with batched ArrayLike<T> reads |

A Future is consumed once, through `await`/`then` or a ready `poll()` value.
Repeated consumption is not guaranteed and has no new runtime validation.
`poll()` on pending state and `waitReady()` only observe readiness. Cancellation
and async disposal request release of the pending operation. Async WIT calls remain
Promises, distinct from Future values.

Stream has blocking read, nonblocking tryRead, readiness and cancellation operations.
`undefined` denotes EOF. `createStream()` creates bounded read/write ends; writes
wait for capacity, producer close drains queued values before EOF, and reader cancel
wakes blocked writers. Future reports the operation result independently of stream
EOF. These are not Web Streams or AsyncIterable on the base Context. Conversions to
those APIs belong to Host wrappers or ABI adapters.

Own values move at invocation, including explicit spawn stdio on failed launch.
Descriptors passed to spawn are borrowed. Streams survive their descriptor's drop.
Wait is one-shot; wait, requestStop and child-handle drop are independent. Dropping
a child handle does not stop it. Resource close, ordinary lifetime invalidation and
cleanup remain active; no new own/borrow-violation checks are introduced.

## Host convenience wrapper

```ts
await using os = await Walos.create();
await using host = new HostProcessContext(os.getHostProcess());
const [[root]] = host.fs.getDirectories();
await using file = await root.openAt({}, 'file', { create: true }, { write: true });
await using output = await file.writeViaStream(0n);
const ready = output.subscribe();
await ready.block();
await ready[Symbol.asyncDispose]();
output.checkWrite();
await output.write(new Uint8Array([1, 2, 3]));
await output.blockingFlush();
```

`HostProcessContext` borrows Context. It owns only the descriptor, endpoint, child
handle, pollable and conversion views created through it; its disposal neither
disposes Context nor stops processes. It drains pending resource creation and drops
late-created resources. `HostDescriptor`, `HostInput`, `HostOutput` and
`HostChildProcess` name convenience views, not the standard WIT resource contracts.
Descriptor getType/getFlags are async in these conversions. `toPromise`,
`createStream` and `toReadableStream` provide explicit convenience conversion.

Walos io endpoints carry ownership for Pipe/file stdio. Data operations use native
stream/future values. Descriptor-to-endpoint factories preserve independent file
stream lifetime and permit moving stdio without moving its descriptor. A
whenWritable capacity Future preserves actual transport readiness and bounded
reservations when translating to P1/P2 permits. None of these operations introduces
a second filesystem or transport implementation.

## Errors and unsupported APIs

Standard Results stay Results. Host convenience views unwrap Results to ServiceError;
ABI adapters translate to their target errno/variant. An unimplemented operation
throws UnimplementedWasiError from the shared Context, with its complete WIT path.
It is never converted into an unsupported Result, dummy success or no-op. Host
observes the JS exception; executing Wasm observes a Trap. See
[wasi-p3-coverage.md](wasi-p3-coverage.md) for every operation and limitation.

CLI exit throws the shared ProcessExit control signal. Runtime translates that
signal to normal process completion; a direct Host caller observes the same signal.
PWD remains an environment snapshot read lazily when needed. There is no Context
cwd/chdir API, implicit child environment inheritance or new spawn-time PWD check.
