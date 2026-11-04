# Filesystem storage contract

`Walos.create({ storage, env?, argv? })` requires a caller-owned OPFS directory
handle. Supply an empty dedicated directory for a new filesystem, or the same
directory to reopen it. The library never obtains the origin's OPFS root itself.
The supplied handle is cloned to child workers; their WASI `/` refers to the same
logical filesystem. Files outside the supplied directory are untouched. There is
no automatic import of the previous physical directory layout.

```ts
const storage = await (await navigator.storage.getDirectory())
  .getDirectoryHandle('my-os-v1', { create: true });
await using os = await Walos.create({ storage });
```

The directory is exclusively managed by walos. Unknown contents, unknown format
versions, malformed metadata and missing referenced payloads reject initialization
without formatting the directory. Do not directly modify its internal files.
The demo uses `walos-v1`, preserving the old origin-level user files separately.
Only one active OS instance may use a given storage directory. Concurrent tabs
and reopening while an earlier instance is alive are outside the contract.

## Representation and recovery

Format version 1 stores a `namespace.json` snapshot and `objects/<object-id>`
payload files. Directory entries map names to stable object IDs. Directory and
symlink records live in the snapshot; symlink contents are stored verbatim.
Internal files never appear in WASI directory listings. Hard links share payload,
metadata, identity and link count. Directory hard links are prohibited. A hard
link to a symlink with follow disabled links the symlink object itself.

Origin-wide Web Locks serialize namespace and metadata transactions across Host
and Process Workers, including different storage directories. Each transaction
reloads metadata and commits through an OPFS writable-file replacement. A failed
transaction does not publish its in-memory changes. Payload creation precedes
namespace commit. Restart removes payloads that were never committed and reclaims
objects unreachable from the logical root. Before reclaiming anything it validates
the namespace and checks all referenced payloads. Interrupted first-time
initialization that has not established a valid snapshot fails closed.

Unlinked objects remain available to existing descriptors and independently owned
streams. Physical reclamation is deliberately deferred until the next OS startup,
so heavy unlink workloads can retain disk space for the current session. Directory
rename is a namespace transaction, including replacement of an empty directory;
renaming a directory into its own subtree is rejected.

Namespace commits are independent of file data commits. File bytes still use local
OPFS I/O and its exclusive writer locks; concurrent writers can return `busy`.
There is no atomic transaction spanning file content and metadata and no claim of
power-loss durability beyond the browser's OPFS guarantees. At restart a changed
physical modification stamp/size reconciles interrupted writes with logical mtime
and change generation. This is best effort for equal-size writes within the
browser's timestamp resolution. It does not restore partially written content.

## Paths, timestamps and flags

Paths resolve component by component, including symlink expansion before `..`.
Every step must remain within the operation's base Directory Descriptor, even if
another preopen could access the destination. Absolute input paths and absolute
symlink targets return `not-permitted`. Relative dangling targets can be created;
following them returns `no-entry`. More than 40 symlink expansions returns `loop`.
Intermediate links are followed; final links follow `symlink-follow` for stat,
open, set-times and link. Open without follow rejects a final symlink with `loop`.
Readlink, unlink and rename operate on the final link itself. A trailing slash
requires a directory. Empty paths and NUL-containing paths return `invalid`.

Files, directories and symlinks maintain atime, mtime and ctime. Explicit times
retain the WIT u64 seconds and nanosecond precision. `now` uses `Date.now()` with
millisecond resolution; both fields in one call use the same captured time.
`no-change` preserves the field; changing either field updates ctime. Invalid
nanoseconds or seconds return `invalid` without partially changing metadata.
Descriptor set-times requires write; path set-times requires mutate-directory.

Automatic access-time updates are disabled (noatime). Awaited file writes/truncation update
mtime/ctime and generation when the operation succeeds. Flush/finish commits the
OPFS writable data and physical stamp without overwriting later explicit times;
callers needing committed data/size should flush/finish first. Namespace changes update parent
mtime/ctime; link/unlink/rename update object ctime while preserving its mtime.
Directory sizes are zero and directory link counts count namespace references,
without synthetic `.`/`..` entries. Unlinked open objects report link count zero.

Metadata hashes are SHA-256 truncated to 128 bits over object ID, size, logical
mtime and change generation. They are stable across reopen/reload without changes,
shared across hard links, and change on replacement even with identical size and
mtime. They are change hints, not content hashes or filesystem-wide identity.

Advice is an intentional no-op on a live descriptor. Integrity-sync open flags
return `unsupported`: OPFS does not provide the requested guarantees. Truncate
requires write, and create/truncate/write/mutate-directory opens require a mutable
base directory. Host, P1, P2 and P3 use the same filesystem service; browser errors
and service errors are converted to their corresponding WASI results/errno.
