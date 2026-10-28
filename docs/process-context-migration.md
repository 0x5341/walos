# Migrating to the WASI 0.3.2 Context

The public TS API is replaced. `getHostProcess()` returns the raw P3-based Context,
with `wasi` package/interface groups and independent `walos` extensions. It does
not automatically return a convenience wrapper.

For former Host `fs/io/process/env/clock/random` convenience calls, explicitly use
`new HostProcessContext(os.getHostProcess())`. Replace old public resource type
names with HostDescriptor, HostInput, HostOutput and HostChildProcess. Descriptor
getType/getFlags now return Promises. Dispose the wrapper to release its generated
resources; Walos alone owns the underlying Host/Context lifetime.

For direct use, follow `docs/process-context-api.md`: handle Result variants,
consume Future once and own/drop Stream ends. P3 FS getType is an async Result of a
variant, not the former synchronous string. FS and stdio read-via-stream return a
Stream/Future tuple; writes accept a Stream and return a Future. HTTP, sockets and
timezone are typed but throw from the common Context.

Standard WASI P1 and P2 binaries remain executable. Their adapter-specific integer
handles, errno, pollables, stream permits and variant representations remain inside
ABI conversion. P1/P2 use the new raw Context and do not own an OS service stack.

The old Walos custom ABIs are intentionally replaced. Recompile P1 extensions
against the `walos_p1_v3` import module in apps/webos.h. P2 custom extensions use
`walos:runtime-p2@0.3.2` (wit/world.wit) with P2 standard resource representations;
P3 extensions use `walos:runtime@0.3.2` (wit/p3/world.wit), with P3 descriptors,
owned I/O endpoints, Future/Stream and async process operations. These are distinct
ABI representations of the same Walos process/Pipe operations. The previous
webos_v1 and walos:runtime@0.2.0 custom binaries have no compatibility path.

The demo, Host test harness, API type examples and P1/P2 custom fixtures migrate in
this change. PWD remains lazy, explicit stdio moves at invocation, descriptors are
borrowed for spawn, child wait is one-shot and handle drop never means stop. Host
is still a Main Thread logical Process with no Runtime or Process Worker.

The authoritative WIT is pinned and hash-checked. jco-generated declarations are
ABI/reference material; the production TS projection preserves Result and uses
dedicated Future/Stream abstractions. Regenerate with `npm run generate:wasi` and
validate with `npm run check:wasi`, `check:wit` and `check:wit:p3`. Runtime tools are
pinned by `scripts/setup-runtime-tools.sh`; the older P1/P2 fixture toolchain is
retained for standard binary regression coverage.
