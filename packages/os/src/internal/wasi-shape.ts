// Generated from pinned WIT.
export const apiShape = [
  {
    package: 'wasi:clocks',
    interface: 'types',
    operations: [],
  },
  {
    package: 'wasi:clocks',
    interface: 'monotonic-clock',
    operations: [
      {
        wit: 'now',
        ts: 'now',
        kind: 'freestanding',
      },
      {
        wit: 'get-resolution',
        ts: 'getResolution',
        kind: 'freestanding',
      },
      {
        wit: 'wait-until',
        ts: 'waitUntil',
        kind: 'async-freestanding',
      },
      {
        wit: 'wait-for',
        ts: 'waitFor',
        kind: 'async-freestanding',
      },
    ],
  },
  {
    package: 'wasi:clocks',
    interface: 'system-clock',
    operations: [
      {
        wit: 'now',
        ts: 'now',
        kind: 'freestanding',
      },
      {
        wit: 'get-resolution',
        ts: 'getResolution',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:clocks',
    interface: 'timezone',
    operations: [
      {
        wit: 'iana-id',
        ts: 'ianaId',
        kind: 'freestanding',
      },
      {
        wit: 'utc-offset',
        ts: 'utcOffset',
        kind: 'freestanding',
      },
      {
        wit: 'to-debug-string',
        ts: 'toDebugString',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:filesystem',
    interface: 'types',
    operations: [
      {
        wit: '[method]descriptor.read-via-stream',
        ts: 'readViaStream',
        kind: {
          method: 23,
        },
      },
      {
        wit: '[method]descriptor.write-via-stream',
        ts: 'writeViaStream',
        kind: {
          method: 23,
        },
      },
      {
        wit: '[method]descriptor.append-via-stream',
        ts: 'appendViaStream',
        kind: {
          method: 23,
        },
      },
      {
        wit: '[method]descriptor.advise',
        ts: 'advise',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.sync-data',
        ts: 'syncData',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.get-flags',
        ts: 'getFlags',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.get-type',
        ts: 'getType',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.set-size',
        ts: 'setSize',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.set-times',
        ts: 'setTimes',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.read-directory',
        ts: 'readDirectory',
        kind: {
          method: 23,
        },
      },
      {
        wit: '[method]descriptor.sync',
        ts: 'sync',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.create-directory-at',
        ts: 'createDirectoryAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.stat',
        ts: 'stat',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.stat-at',
        ts: 'statAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.set-times-at',
        ts: 'setTimesAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.link-at',
        ts: 'linkAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.open-at',
        ts: 'openAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.readlink-at',
        ts: 'readlinkAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.remove-directory-at',
        ts: 'removeDirectoryAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.rename-at',
        ts: 'renameAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.symlink-at',
        ts: 'symlinkAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.unlink-file-at',
        ts: 'unlinkFileAt',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.is-same-object',
        ts: 'isSameObject',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.metadata-hash',
        ts: 'metadataHash',
        kind: {
          'async-method': 23,
        },
      },
      {
        wit: '[method]descriptor.metadata-hash-at',
        ts: 'metadataHashAt',
        kind: {
          'async-method': 23,
        },
      },
    ],
  },
  {
    package: 'wasi:filesystem',
    interface: 'preopens',
    operations: [
      {
        wit: 'get-directories',
        ts: 'getDirectories',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:sockets',
    interface: 'types',
    operations: [
      {
        wit: '[static]tcp-socket.create',
        ts: 'create',
        kind: {
          static: 52,
        },
      },
      {
        wit: '[method]tcp-socket.bind',
        ts: 'bind',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.connect',
        ts: 'connect',
        kind: {
          'async-method': 52,
        },
      },
      {
        wit: '[method]tcp-socket.listen',
        ts: 'listen',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.send',
        ts: 'send',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.receive',
        ts: 'receive',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-local-address',
        ts: 'getLocalAddress',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-remote-address',
        ts: 'getRemoteAddress',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-is-listening',
        ts: 'getIsListening',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-address-family',
        ts: 'getAddressFamily',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-listen-backlog-size',
        ts: 'setListenBacklogSize',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-keep-alive-enabled',
        ts: 'getKeepAliveEnabled',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-keep-alive-enabled',
        ts: 'setKeepAliveEnabled',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-keep-alive-idle-time',
        ts: 'getKeepAliveIdleTime',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-keep-alive-idle-time',
        ts: 'setKeepAliveIdleTime',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-keep-alive-interval',
        ts: 'getKeepAliveInterval',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-keep-alive-interval',
        ts: 'setKeepAliveInterval',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-keep-alive-count',
        ts: 'getKeepAliveCount',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-keep-alive-count',
        ts: 'setKeepAliveCount',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-hop-limit',
        ts: 'getHopLimit',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-hop-limit',
        ts: 'setHopLimit',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-receive-buffer-size',
        ts: 'getReceiveBufferSize',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-receive-buffer-size',
        ts: 'setReceiveBufferSize',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.get-send-buffer-size',
        ts: 'getSendBufferSize',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[method]tcp-socket.set-send-buffer-size',
        ts: 'setSendBufferSize',
        kind: {
          method: 52,
        },
      },
      {
        wit: '[static]udp-socket.create',
        ts: 'create',
        kind: {
          static: 53,
        },
      },
      {
        wit: '[method]udp-socket.bind',
        ts: 'bind',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.connect',
        ts: 'connect',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.disconnect',
        ts: 'disconnect',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.send',
        ts: 'send',
        kind: {
          'async-method': 53,
        },
      },
      {
        wit: '[method]udp-socket.receive',
        ts: 'receive',
        kind: {
          'async-method': 53,
        },
      },
      {
        wit: '[method]udp-socket.get-local-address',
        ts: 'getLocalAddress',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.get-remote-address',
        ts: 'getRemoteAddress',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.get-address-family',
        ts: 'getAddressFamily',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.get-unicast-hop-limit',
        ts: 'getUnicastHopLimit',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.set-unicast-hop-limit',
        ts: 'setUnicastHopLimit',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.get-receive-buffer-size',
        ts: 'getReceiveBufferSize',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.set-receive-buffer-size',
        ts: 'setReceiveBufferSize',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.get-send-buffer-size',
        ts: 'getSendBufferSize',
        kind: {
          method: 53,
        },
      },
      {
        wit: '[method]udp-socket.set-send-buffer-size',
        ts: 'setSendBufferSize',
        kind: {
          method: 53,
        },
      },
    ],
  },
  {
    package: 'wasi:sockets',
    interface: 'ip-name-lookup',
    operations: [
      {
        wit: 'resolve-addresses',
        ts: 'resolveAddresses',
        kind: 'async-freestanding',
      },
    ],
  },
  {
    package: 'wasi:random',
    interface: 'insecure-seed',
    operations: [
      {
        wit: 'get-insecure-seed',
        ts: 'getInsecureSeed',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:random',
    interface: 'insecure',
    operations: [
      {
        wit: 'get-insecure-random-bytes',
        ts: 'getInsecureRandomBytes',
        kind: 'freestanding',
      },
      {
        wit: 'get-insecure-random-u64',
        ts: 'getInsecureRandomU64',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:random',
    interface: 'random',
    operations: [
      {
        wit: 'get-random-bytes',
        ts: 'getRandomBytes',
        kind: 'freestanding',
      },
      {
        wit: 'get-random-u64',
        ts: 'getRandomU64',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'environment',
    operations: [
      {
        wit: 'get-environment',
        ts: 'getEnvironment',
        kind: 'freestanding',
      },
      {
        wit: 'get-arguments',
        ts: 'getArguments',
        kind: 'freestanding',
      },
      {
        wit: 'get-initial-cwd',
        ts: 'getInitialCwd',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'exit',
    operations: [
      {
        wit: 'exit',
        ts: 'exit',
        kind: 'freestanding',
      },
      {
        wit: 'exit-with-code',
        ts: 'exitWithCode',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'run',
    operations: [
      {
        wit: 'run',
        ts: 'run',
        kind: 'async-freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'types',
    operations: [],
  },
  {
    package: 'wasi:cli',
    interface: 'stdin',
    operations: [
      {
        wit: 'read-via-stream',
        ts: 'readViaStream',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'stdout',
    operations: [
      {
        wit: 'write-via-stream',
        ts: 'writeViaStream',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'stderr',
    operations: [
      {
        wit: 'write-via-stream',
        ts: 'writeViaStream',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'terminal-input',
    operations: [],
  },
  {
    package: 'wasi:cli',
    interface: 'terminal-output',
    operations: [],
  },
  {
    package: 'wasi:cli',
    interface: 'terminal-stdin',
    operations: [
      {
        wit: 'get-terminal-stdin',
        ts: 'getTerminalStdin',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'terminal-stdout',
    operations: [
      {
        wit: 'get-terminal-stdout',
        ts: 'getTerminalStdout',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:cli',
    interface: 'terminal-stderr',
    operations: [
      {
        wit: 'get-terminal-stderr',
        ts: 'getTerminalStderr',
        kind: 'freestanding',
      },
    ],
  },
  {
    package: 'wasi:http',
    interface: 'types',
    operations: [
      {
        wit: '[constructor]fields',
        ts: 'new',
        kind: {
          constructor: 127,
        },
      },
      {
        wit: '[static]fields.from-list',
        ts: 'fromList',
        kind: {
          static: 127,
        },
      },
      {
        wit: '[method]fields.get',
        ts: 'get',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[method]fields.has',
        ts: 'has',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[method]fields.set',
        ts: 'set',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[method]fields.delete',
        ts: 'delete',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[method]fields.get-and-delete',
        ts: 'getAndDelete',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[method]fields.append',
        ts: 'append',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[method]fields.copy-all',
        ts: 'copyAll',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[method]fields.clone',
        ts: 'clone',
        kind: {
          method: 127,
        },
      },
      {
        wit: '[static]request.new',
        ts: 'new',
        kind: {
          static: 130,
        },
      },
      {
        wit: '[method]request.get-method',
        ts: 'getMethod',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.set-method',
        ts: 'setMethod',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.get-path-with-query',
        ts: 'getPathWithQuery',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.set-path-with-query',
        ts: 'setPathWithQuery',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.get-scheme',
        ts: 'getScheme',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.set-scheme',
        ts: 'setScheme',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.get-authority',
        ts: 'getAuthority',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.set-authority',
        ts: 'setAuthority',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.get-options',
        ts: 'getOptions',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[method]request.get-headers',
        ts: 'getHeaders',
        kind: {
          method: 130,
        },
      },
      {
        wit: '[static]request.consume-body',
        ts: 'consumeBody',
        kind: {
          static: 130,
        },
      },
      {
        wit: '[constructor]request-options',
        ts: 'new',
        kind: {
          constructor: 131,
        },
      },
      {
        wit: '[method]request-options.get-connect-timeout',
        ts: 'getConnectTimeout',
        kind: {
          method: 131,
        },
      },
      {
        wit: '[method]request-options.set-connect-timeout',
        ts: 'setConnectTimeout',
        kind: {
          method: 131,
        },
      },
      {
        wit: '[method]request-options.get-first-byte-timeout',
        ts: 'getFirstByteTimeout',
        kind: {
          method: 131,
        },
      },
      {
        wit: '[method]request-options.set-first-byte-timeout',
        ts: 'setFirstByteTimeout',
        kind: {
          method: 131,
        },
      },
      {
        wit: '[method]request-options.get-between-bytes-timeout',
        ts: 'getBetweenBytesTimeout',
        kind: {
          method: 131,
        },
      },
      {
        wit: '[method]request-options.set-between-bytes-timeout',
        ts: 'setBetweenBytesTimeout',
        kind: {
          method: 131,
        },
      },
      {
        wit: '[method]request-options.clone',
        ts: 'clone',
        kind: {
          method: 131,
        },
      },
      {
        wit: '[static]response.new',
        ts: 'new',
        kind: {
          static: 133,
        },
      },
      {
        wit: '[method]response.get-status-code',
        ts: 'getStatusCode',
        kind: {
          method: 133,
        },
      },
      {
        wit: '[method]response.set-status-code',
        ts: 'setStatusCode',
        kind: {
          method: 133,
        },
      },
      {
        wit: '[method]response.get-headers',
        ts: 'getHeaders',
        kind: {
          method: 133,
        },
      },
      {
        wit: '[static]response.consume-body',
        ts: 'consumeBody',
        kind: {
          static: 133,
        },
      },
    ],
  },
  {
    package: 'wasi:http',
    interface: 'handler',
    operations: [
      {
        wit: 'handle',
        ts: 'handle',
        kind: 'async-freestanding',
      },
    ],
  },
  {
    package: 'wasi:http',
    interface: 'client',
    operations: [
      {
        wit: 'send',
        ts: 'send',
        kind: 'async-freestanding',
      },
    ],
  },
  {
    package: 'walos:runtime',
    interface: 'io',
    operations: [
      {
        wit: '[method]input-endpoint.read-via-stream',
        ts: 'readViaStream',
        kind: {
          method: 181,
        },
      },
      {
        wit: '[method]output-endpoint.when-writable',
        ts: 'whenWritable',
        kind: {
          method: 182,
        },
      },
      {
        wit: '[method]output-endpoint.write-via-stream',
        ts: 'writeViaStream',
        kind: {
          method: 182,
        },
      },
      {
        wit: 'read-via-descriptor',
        ts: 'readViaDescriptor',
        kind: 'async-freestanding',
      },
      {
        wit: 'write-via-descriptor',
        ts: 'writeViaDescriptor',
        kind: 'async-freestanding',
      },
      {
        wit: 'get-stdin',
        ts: 'getStdin',
        kind: 'freestanding',
      },
      {
        wit: 'get-stdout',
        ts: 'getStdout',
        kind: 'freestanding',
      },
      {
        wit: 'get-stderr',
        ts: 'getStderr',
        kind: 'freestanding',
      },
      {
        wit: 'create-pipe',
        ts: 'createPipe',
        kind: 'async-freestanding',
      },
    ],
  },
  {
    package: 'walos:runtime',
    interface: 'process',
    operations: [
      {
        wit: '[method]child-process.pid',
        ts: 'pid',
        kind: {
          method: 203,
        },
      },
      {
        wit: '[method]child-process.wait',
        ts: 'wait',
        kind: {
          'async-method': 203,
        },
      },
      {
        wit: '[method]child-process.request-stop',
        ts: 'requestStop',
        kind: {
          'async-method': 203,
        },
      },
      {
        wit: 'spawn',
        ts: 'spawn',
        kind: 'async-freestanding',
      },
    ],
  },
] as const;
