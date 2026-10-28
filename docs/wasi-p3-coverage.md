# WASI 0.3.2 coverage

Source: official tag v0.3.2, commit `bdadbbb8cadd287cc5014c4b5a0bf76efc60291c`. The source WIT is pinned in
`wit/p3/deps`; `api.json` inventories every type, function, async signature and
resource. Generated bindings are a comparison/ABI reference, not the public Context.

All 28 interfaces and 143 operations have public TS types. CLI run
is an export/Runtime entrypoint, not an OS import on Context. The optional timezone
feature in the tag is included and traps. Type-only interfaces and all named
types are included in the API inventory even when they have no operation row.

Trap means the shared Context throws UnimplementedWasiError with the WIT operation
path. No unsupported success or invented Result variant is returned. HTTP/socket
resources are not fabricated: their constructors/factories trap, so no usable
instances are provided. Their complete instance-method types remain public.

Partial filesystem behavior uses OPFS files/directories, optional timestamps,
advisory no-op advice and existing unsupported flag results. Metadata hashes are
computed from supported stat metadata. Hard/symbolic links and setting timestamps
trap. No new HTTP/socket transport is implemented.

Walos io endpoints are owned transfer capabilities. Their data operations use P3
stream/future values; when-writable exposes a capacity Future, with a minimum
threshold, to preserve real Pipe backpressure in P1/P2 and Host conversions. The
descriptor-to-endpoint factories support moving file stdio without moving its
borrowed descriptor. Native P1/P2 representations stay in ABI adapters.

| Interface | Operation | Status |
| --- | --- | --- |
| wasi:clocks/monotonic-clock@0.3.2 | now | implemented |
| wasi:clocks/monotonic-clock@0.3.2 | get-resolution | implemented |
| wasi:clocks/monotonic-clock@0.3.2 | wait-until | implemented |
| wasi:clocks/monotonic-clock@0.3.2 | wait-for | implemented |
| wasi:clocks/system-clock@0.3.2 | now | implemented |
| wasi:clocks/system-clock@0.3.2 | get-resolution | implemented |
| wasi:clocks/timezone@0.3.2 | iana-id | Trap |
| wasi:clocks/timezone@0.3.2 | utc-offset | Trap |
| wasi:clocks/timezone@0.3.2 | to-debug-string | Trap |
| wasi:filesystem/types@0.3.2 | [method]descriptor.read-via-stream | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.write-via-stream | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.append-via-stream | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.advise | partial |
| wasi:filesystem/types@0.3.2 | [method]descriptor.sync-data | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.get-flags | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.get-type | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.set-size | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.set-times | Trap |
| wasi:filesystem/types@0.3.2 | [method]descriptor.read-directory | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.sync | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.create-directory-at | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.stat | partial |
| wasi:filesystem/types@0.3.2 | [method]descriptor.stat-at | partial |
| wasi:filesystem/types@0.3.2 | [method]descriptor.set-times-at | Trap |
| wasi:filesystem/types@0.3.2 | [method]descriptor.link-at | Trap |
| wasi:filesystem/types@0.3.2 | [method]descriptor.open-at | partial |
| wasi:filesystem/types@0.3.2 | [method]descriptor.readlink-at | Trap |
| wasi:filesystem/types@0.3.2 | [method]descriptor.remove-directory-at | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.rename-at | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.symlink-at | Trap |
| wasi:filesystem/types@0.3.2 | [method]descriptor.unlink-file-at | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.is-same-object | implemented |
| wasi:filesystem/types@0.3.2 | [method]descriptor.metadata-hash | partial |
| wasi:filesystem/types@0.3.2 | [method]descriptor.metadata-hash-at | partial |
| wasi:filesystem/preopens@0.3.2 | get-directories | implemented |
| wasi:sockets/types@0.3.2 | [static]tcp-socket.create | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.bind | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.connect | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.listen | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.send | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.receive | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-local-address | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-remote-address | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-is-listening | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-address-family | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-listen-backlog-size | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-keep-alive-enabled | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-keep-alive-enabled | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-keep-alive-idle-time | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-keep-alive-idle-time | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-keep-alive-interval | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-keep-alive-interval | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-keep-alive-count | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-keep-alive-count | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-hop-limit | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-hop-limit | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-receive-buffer-size | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-receive-buffer-size | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.get-send-buffer-size | Trap |
| wasi:sockets/types@0.3.2 | [method]tcp-socket.set-send-buffer-size | Trap |
| wasi:sockets/types@0.3.2 | [static]udp-socket.create | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.bind | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.connect | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.disconnect | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.send | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.receive | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.get-local-address | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.get-remote-address | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.get-address-family | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.get-unicast-hop-limit | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.set-unicast-hop-limit | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.get-receive-buffer-size | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.set-receive-buffer-size | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.get-send-buffer-size | Trap |
| wasi:sockets/types@0.3.2 | [method]udp-socket.set-send-buffer-size | Trap |
| wasi:sockets/ip-name-lookup@0.3.2 | resolve-addresses | Trap |
| wasi:random/insecure-seed@0.3.2 | get-insecure-seed | implemented |
| wasi:random/insecure@0.3.2 | get-insecure-random-bytes | implemented |
| wasi:random/insecure@0.3.2 | get-insecure-random-u64 | implemented |
| wasi:random/random@0.3.2 | get-random-bytes | implemented |
| wasi:random/random@0.3.2 | get-random-u64 | implemented |
| wasi:cli/environment@0.3.2 | get-environment | implemented |
| wasi:cli/environment@0.3.2 | get-arguments | implemented |
| wasi:cli/environment@0.3.2 | get-initial-cwd | implemented |
| wasi:cli/exit@0.3.2 | exit | implemented |
| wasi:cli/exit@0.3.2 | exit-with-code | implemented |
| wasi:cli/run@0.3.2 | run | Runtime entrypoint (P3 gate pending) |
| wasi:cli/stdin@0.3.2 | read-via-stream | implemented |
| wasi:cli/stdout@0.3.2 | write-via-stream | implemented |
| wasi:cli/stderr@0.3.2 | write-via-stream | implemented |
| wasi:cli/terminal-stdin@0.3.2 | get-terminal-stdin | implemented |
| wasi:cli/terminal-stdout@0.3.2 | get-terminal-stdout | implemented |
| wasi:cli/terminal-stderr@0.3.2 | get-terminal-stderr | implemented |
| wasi:http/types@0.3.2 | [constructor]fields | Trap |
| wasi:http/types@0.3.2 | [static]fields.from-list | Trap |
| wasi:http/types@0.3.2 | [method]fields.get | Trap |
| wasi:http/types@0.3.2 | [method]fields.has | Trap |
| wasi:http/types@0.3.2 | [method]fields.set | Trap |
| wasi:http/types@0.3.2 | [method]fields.delete | Trap |
| wasi:http/types@0.3.2 | [method]fields.get-and-delete | Trap |
| wasi:http/types@0.3.2 | [method]fields.append | Trap |
| wasi:http/types@0.3.2 | [method]fields.copy-all | Trap |
| wasi:http/types@0.3.2 | [method]fields.clone | Trap |
| wasi:http/types@0.3.2 | [static]request.new | Trap |
| wasi:http/types@0.3.2 | [method]request.get-method | Trap |
| wasi:http/types@0.3.2 | [method]request.set-method | Trap |
| wasi:http/types@0.3.2 | [method]request.get-path-with-query | Trap |
| wasi:http/types@0.3.2 | [method]request.set-path-with-query | Trap |
| wasi:http/types@0.3.2 | [method]request.get-scheme | Trap |
| wasi:http/types@0.3.2 | [method]request.set-scheme | Trap |
| wasi:http/types@0.3.2 | [method]request.get-authority | Trap |
| wasi:http/types@0.3.2 | [method]request.set-authority | Trap |
| wasi:http/types@0.3.2 | [method]request.get-options | Trap |
| wasi:http/types@0.3.2 | [method]request.get-headers | Trap |
| wasi:http/types@0.3.2 | [static]request.consume-body | Trap |
| wasi:http/types@0.3.2 | [constructor]request-options | Trap |
| wasi:http/types@0.3.2 | [method]request-options.get-connect-timeout | Trap |
| wasi:http/types@0.3.2 | [method]request-options.set-connect-timeout | Trap |
| wasi:http/types@0.3.2 | [method]request-options.get-first-byte-timeout | Trap |
| wasi:http/types@0.3.2 | [method]request-options.set-first-byte-timeout | Trap |
| wasi:http/types@0.3.2 | [method]request-options.get-between-bytes-timeout | Trap |
| wasi:http/types@0.3.2 | [method]request-options.set-between-bytes-timeout | Trap |
| wasi:http/types@0.3.2 | [method]request-options.clone | Trap |
| wasi:http/types@0.3.2 | [static]response.new | Trap |
| wasi:http/types@0.3.2 | [method]response.get-status-code | Trap |
| wasi:http/types@0.3.2 | [method]response.set-status-code | Trap |
| wasi:http/types@0.3.2 | [method]response.get-headers | Trap |
| wasi:http/types@0.3.2 | [static]response.consume-body | Trap |
| wasi:http/handler@0.3.2 | handle | Trap |
| wasi:http/client@0.3.2 | send | Trap |
| walos:runtime/io@0.3.2 | [method]input-endpoint.read-via-stream | implemented |
| walos:runtime/io@0.3.2 | [method]output-endpoint.when-writable | implemented |
| walos:runtime/io@0.3.2 | [method]output-endpoint.write-via-stream | implemented |
| walos:runtime/io@0.3.2 | read-via-descriptor | implemented |
| walos:runtime/io@0.3.2 | write-via-descriptor | implemented |
| walos:runtime/io@0.3.2 | get-stdin | implemented |
| walos:runtime/io@0.3.2 | get-stdout | implemented |
| walos:runtime/io@0.3.2 | get-stderr | implemented |
| walos:runtime/io@0.3.2 | create-pipe | implemented |
| walos:runtime/process@0.3.2 | [method]child-process.pid | implemented |
| walos:runtime/process@0.3.2 | [method]child-process.wait | implemented |
| walos:runtime/process@0.3.2 | [method]child-process.request-stop | implemented |
| walos:runtime/process@0.3.2 | spawn | implemented |
