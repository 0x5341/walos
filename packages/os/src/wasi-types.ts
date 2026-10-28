// Generated from the official WASI v0.3.2 WIT and Walos extensions.
// Run npm run generate:wasi; do not edit this projection by hand.
import type { Future, Stream } from './async.js';
export type U8 = number;
export type U16 = number;
export type U32 = number;
export type U64 = bigint;
export type S8 = number;
export type S16 = number;
export type S32 = number;
export type S64 = bigint;
export type F32 = number;
export type F64 = number;
export type Own<T> = T;
export type Borrow<T> = T;
export type Result<T, E> =
  | { readonly tag: 'ok'; readonly val: T }
  | { readonly tag: 'err'; readonly val: E };
export interface ErrorContext extends AsyncDisposable {
  toDebugString(): string;
}

export namespace WasiClocksTypes {
  export type Duration = U64;
  export interface Interface {}
}

export namespace WasiClocksMonotonicClock {
  export type Duration = WasiClocksTypes.Duration;
  export type Mark = U64;
  export interface Interface {
    now(): Mark;
    getResolution(): Duration;
    waitUntil(when: Mark): Promise<void>;
    waitFor(howLong: Duration): Promise<void>;
  }
}

export namespace WasiClocksSystemClock {
  export type Duration = WasiClocksTypes.Duration;
  export type Instant = { readonly seconds: S64; readonly nanoseconds: U32 };
  export interface Interface {
    now(): Instant;
    getResolution(): Duration;
  }
}

export namespace WasiClocksTimezone {
  export type Instant = WasiClocksSystemClock.Instant;
  export interface Interface {
    ianaId(): string | undefined;
    utcOffset(when: Instant): S64 | undefined;
    toDebugString(): string;
  }
}

export namespace WasiFilesystemTypes {
  export type Instant = WasiClocksSystemClock.Instant;
  export type Filesize = U64;
  export type DescriptorType =
    | { readonly tag: 'block-device' }
    | { readonly tag: 'character-device' }
    | { readonly tag: 'directory' }
    | { readonly tag: 'fifo' }
    | { readonly tag: 'symbolic-link' }
    | { readonly tag: 'regular-file' }
    | { readonly tag: 'socket' }
    | { readonly tag: 'other'; readonly val: string | undefined };
  export type DescriptorFlags = {
    readonly read?: boolean;
    readonly write?: boolean;
    readonly fileIntegritySync?: boolean;
    readonly dataIntegritySync?: boolean;
    readonly requestedWriteSync?: boolean;
    readonly mutateDirectory?: boolean;
  };
  export type PathFlags = { readonly symlinkFollow?: boolean };
  export type OpenFlags = {
    readonly create?: boolean;
    readonly directory?: boolean;
    readonly exclusive?: boolean;
    readonly truncate?: boolean;
  };
  export type LinkCount = U64;
  export type DescriptorStat = {
    readonly type: DescriptorType;
    readonly linkCount: LinkCount;
    readonly size: Filesize;
    readonly dataAccessTimestamp: Instant | undefined;
    readonly dataModificationTimestamp: Instant | undefined;
    readonly statusChangeTimestamp: Instant | undefined;
  };
  export type NewTimestamp =
    | { readonly tag: 'no-change' }
    | { readonly tag: 'now' }
    | { readonly tag: 'timestamp'; readonly val: Instant };
  export type DirectoryEntry = { readonly type: DescriptorType; readonly name: string };
  export type ErrorCode =
    | { readonly tag: 'access' }
    | { readonly tag: 'already' }
    | { readonly tag: 'bad-descriptor' }
    | { readonly tag: 'busy' }
    | { readonly tag: 'deadlock' }
    | { readonly tag: 'quota' }
    | { readonly tag: 'exist' }
    | { readonly tag: 'file-too-large' }
    | { readonly tag: 'illegal-byte-sequence' }
    | { readonly tag: 'in-progress' }
    | { readonly tag: 'interrupted' }
    | { readonly tag: 'invalid' }
    | { readonly tag: 'io' }
    | { readonly tag: 'is-directory' }
    | { readonly tag: 'loop' }
    | { readonly tag: 'too-many-links' }
    | { readonly tag: 'message-size' }
    | { readonly tag: 'name-too-long' }
    | { readonly tag: 'no-device' }
    | { readonly tag: 'no-entry' }
    | { readonly tag: 'no-lock' }
    | { readonly tag: 'insufficient-memory' }
    | { readonly tag: 'insufficient-space' }
    | { readonly tag: 'not-directory' }
    | { readonly tag: 'not-empty' }
    | { readonly tag: 'not-recoverable' }
    | { readonly tag: 'unsupported' }
    | { readonly tag: 'no-tty' }
    | { readonly tag: 'no-such-device' }
    | { readonly tag: 'overflow' }
    | { readonly tag: 'not-permitted' }
    | { readonly tag: 'pipe' }
    | { readonly tag: 'read-only' }
    | { readonly tag: 'invalid-seek' }
    | { readonly tag: 'text-file-busy' }
    | { readonly tag: 'cross-device' }
    | { readonly tag: 'other'; readonly val: string | undefined };
  export type Advice = 'normal' | 'sequential' | 'random' | 'will-need' | 'dont-need' | 'no-reuse';
  export type MetadataHashValue = { readonly lower: U64; readonly upper: U64 };
  export interface Descriptor extends AsyncDisposable {
    readViaStream(offset: Filesize): readonly [Stream<U8>, Future<Result<void, ErrorCode>>];
    writeViaStream(data: Stream<U8>, offset: Filesize): Future<Result<void, ErrorCode>>;
    appendViaStream(data: Stream<U8>): Future<Result<void, ErrorCode>>;
    advise(offset: Filesize, length: Filesize, advice: Advice): Promise<Result<void, ErrorCode>>;
    syncData(): Promise<Result<void, ErrorCode>>;
    getFlags(): Promise<Result<DescriptorFlags, ErrorCode>>;
    getType(): Promise<Result<DescriptorType, ErrorCode>>;
    setSize(size: Filesize): Promise<Result<void, ErrorCode>>;
    setTimes(
      dataAccessTimestamp: NewTimestamp,
      dataModificationTimestamp: NewTimestamp,
    ): Promise<Result<void, ErrorCode>>;
    readDirectory(): readonly [Stream<DirectoryEntry>, Future<Result<void, ErrorCode>>];
    sync(): Promise<Result<void, ErrorCode>>;
    createDirectoryAt(path: string): Promise<Result<void, ErrorCode>>;
    stat(): Promise<Result<DescriptorStat, ErrorCode>>;
    statAt(pathFlags: PathFlags, path: string): Promise<Result<DescriptorStat, ErrorCode>>;
    setTimesAt(
      pathFlags: PathFlags,
      path: string,
      dataAccessTimestamp: NewTimestamp,
      dataModificationTimestamp: NewTimestamp,
    ): Promise<Result<void, ErrorCode>>;
    linkAt(
      oldPathFlags: PathFlags,
      oldPath: string,
      newDescriptor: Borrow<Descriptor>,
      newPath: string,
    ): Promise<Result<void, ErrorCode>>;
    openAt(
      pathFlags: PathFlags,
      path: string,
      openFlags: OpenFlags,
      flags: DescriptorFlags,
    ): Promise<Result<Own<Descriptor>, ErrorCode>>;
    readlinkAt(path: string): Promise<Result<string, ErrorCode>>;
    removeDirectoryAt(path: string): Promise<Result<void, ErrorCode>>;
    renameAt(
      oldPath: string,
      newDescriptor: Borrow<Descriptor>,
      newPath: string,
    ): Promise<Result<void, ErrorCode>>;
    symlinkAt(oldPath: string, newPath: string): Promise<Result<void, ErrorCode>>;
    unlinkFileAt(path: string): Promise<Result<void, ErrorCode>>;
    isSameObject(other: Borrow<Descriptor>): Promise<boolean>;
    metadataHash(): Promise<Result<MetadataHashValue, ErrorCode>>;
    metadataHashAt(
      pathFlags: PathFlags,
      path: string,
    ): Promise<Result<MetadataHashValue, ErrorCode>>;
  }
  export interface Interface {}
}

export namespace WasiFilesystemPreopens {
  export type Descriptor = WasiFilesystemTypes.Descriptor;
  export interface Interface {
    getDirectories(): readonly (readonly [Own<Descriptor>, string])[];
  }
}

export namespace WasiSocketsTypes {
  export type Duration = WasiClocksTypes.Duration;
  export type ErrorCode =
    | { readonly tag: 'access-denied' }
    | { readonly tag: 'not-supported' }
    | { readonly tag: 'invalid-argument' }
    | { readonly tag: 'out-of-memory' }
    | { readonly tag: 'timeout' }
    | { readonly tag: 'invalid-state' }
    | { readonly tag: 'address-not-bindable' }
    | { readonly tag: 'address-in-use' }
    | { readonly tag: 'remote-unreachable' }
    | { readonly tag: 'connection-refused' }
    | { readonly tag: 'connection-broken' }
    | { readonly tag: 'connection-reset' }
    | { readonly tag: 'connection-aborted' }
    | { readonly tag: 'datagram-too-large' }
    | { readonly tag: 'other'; readonly val: string | undefined };
  export type IpAddressFamily = 'ipv4' | 'ipv6';
  export type Ipv4Address = readonly [U8, U8, U8, U8];
  export type Ipv6Address = readonly [U16, U16, U16, U16, U16, U16, U16, U16];
  export type IpAddress =
    | { readonly tag: 'ipv4'; readonly val: Ipv4Address }
    | { readonly tag: 'ipv6'; readonly val: Ipv6Address };
  export type Ipv4SocketAddress = { readonly port: U16; readonly address: Ipv4Address };
  export type Ipv6SocketAddress = {
    readonly port: U16;
    readonly flowInfo: U32;
    readonly address: Ipv6Address;
    readonly scopeId: U32;
  };
  export type IpSocketAddress =
    | { readonly tag: 'ipv4'; readonly val: Ipv4SocketAddress }
    | { readonly tag: 'ipv6'; readonly val: Ipv6SocketAddress };
  export interface TcpSocket extends AsyncDisposable {
    bind(localAddress: IpSocketAddress): Result<void, ErrorCode>;
    connect(remoteAddress: IpSocketAddress): Promise<Result<void, ErrorCode>>;
    listen(): Result<Stream<Own<TcpSocket>>, ErrorCode>;
    send(data: Stream<U8>): Future<Result<void, ErrorCode>>;
    receive(): readonly [Stream<U8>, Future<Result<void, ErrorCode>>];
    getLocalAddress(): Result<IpSocketAddress, ErrorCode>;
    getRemoteAddress(): Result<IpSocketAddress, ErrorCode>;
    getIsListening(): boolean;
    getAddressFamily(): IpAddressFamily;
    setListenBacklogSize(value: U64): Result<void, ErrorCode>;
    getKeepAliveEnabled(): Result<boolean, ErrorCode>;
    setKeepAliveEnabled(value: boolean): Result<void, ErrorCode>;
    getKeepAliveIdleTime(): Result<Duration, ErrorCode>;
    setKeepAliveIdleTime(value: Duration): Result<void, ErrorCode>;
    getKeepAliveInterval(): Result<Duration, ErrorCode>;
    setKeepAliveInterval(value: Duration): Result<void, ErrorCode>;
    getKeepAliveCount(): Result<U32, ErrorCode>;
    setKeepAliveCount(value: U32): Result<void, ErrorCode>;
    getHopLimit(): Result<U8, ErrorCode>;
    setHopLimit(value: U8): Result<void, ErrorCode>;
    getReceiveBufferSize(): Result<U64, ErrorCode>;
    setReceiveBufferSize(value: U64): Result<void, ErrorCode>;
    getSendBufferSize(): Result<U64, ErrorCode>;
    setSendBufferSize(value: U64): Result<void, ErrorCode>;
  }
  export interface UdpSocket extends AsyncDisposable {
    bind(localAddress: IpSocketAddress): Result<void, ErrorCode>;
    connect(remoteAddress: IpSocketAddress): Result<void, ErrorCode>;
    disconnect(): Result<void, ErrorCode>;
    send(
      data: Uint8Array,
      remoteAddress: IpSocketAddress | undefined,
    ): Promise<Result<void, ErrorCode>>;
    receive(): Promise<Result<readonly [Uint8Array, IpSocketAddress], ErrorCode>>;
    getLocalAddress(): Result<IpSocketAddress, ErrorCode>;
    getRemoteAddress(): Result<IpSocketAddress, ErrorCode>;
    getAddressFamily(): IpAddressFamily;
    getUnicastHopLimit(): Result<U8, ErrorCode>;
    setUnicastHopLimit(value: U8): Result<void, ErrorCode>;
    getReceiveBufferSize(): Result<U64, ErrorCode>;
    setReceiveBufferSize(value: U64): Result<void, ErrorCode>;
    getSendBufferSize(): Result<U64, ErrorCode>;
    setSendBufferSize(value: U64): Result<void, ErrorCode>;
  }
  export interface Interface {
    readonly tcpSocket: {
      create(addressFamily: IpAddressFamily): Result<Own<TcpSocket>, ErrorCode>;
    };
    readonly udpSocket: {
      create(addressFamily: IpAddressFamily): Result<Own<UdpSocket>, ErrorCode>;
    };
  }
}

export namespace WasiSocketsIpNameLookup {
  export type IpAddress = WasiSocketsTypes.IpAddress;
  export type ErrorCode =
    | { readonly tag: 'access-denied' }
    | { readonly tag: 'invalid-argument' }
    | { readonly tag: 'name-unresolvable' }
    | { readonly tag: 'temporary-resolver-failure' }
    | { readonly tag: 'permanent-resolver-failure' }
    | { readonly tag: 'other'; readonly val: string | undefined };
  export interface Interface {
    resolveAddresses(name: string): Promise<Result<readonly IpAddress[], ErrorCode>>;
  }
}

export namespace WasiRandomInsecureSeed {
  export interface Interface {
    getInsecureSeed(): readonly [U64, U64];
  }
}

export namespace WasiRandomInsecure {
  export interface Interface {
    getInsecureRandomBytes(maxLen: U64): Uint8Array;
    getInsecureRandomU64(): U64;
  }
}

export namespace WasiRandomRandom {
  export interface Interface {
    getRandomBytes(maxLen: U64): Uint8Array;
    getRandomU64(): U64;
  }
}

export namespace WasiCliEnvironment {
  export interface Interface {
    getEnvironment(): readonly (readonly [string, string])[];
    getArguments(): readonly string[];
    getInitialCwd(): string | undefined;
  }
}

export namespace WasiCliExit {
  export interface Interface {
    exit(status: Result<void, void>): void;
    exitWithCode(statusCode: U8): void;
  }
}

export namespace WasiCliRun {
  export interface Interface {
    run(): Promise<Result<void, void>>;
  }
}

export namespace WasiCliTypes {
  export type ErrorCode = 'io' | 'illegal-byte-sequence' | 'pipe';
  export interface Interface {}
}

export namespace WasiCliStdin {
  export type ErrorCode = WasiCliTypes.ErrorCode;
  export interface Interface {
    readViaStream(): readonly [Stream<U8>, Future<Result<void, ErrorCode>>];
  }
}

export namespace WasiCliStdout {
  export type ErrorCode = WasiCliTypes.ErrorCode;
  export interface Interface {
    writeViaStream(data: Stream<U8>): Future<Result<void, ErrorCode>>;
  }
}

export namespace WasiCliStderr {
  export type ErrorCode = WasiCliTypes.ErrorCode;
  export interface Interface {
    writeViaStream(data: Stream<U8>): Future<Result<void, ErrorCode>>;
  }
}

export namespace WasiCliTerminalInput {
  export interface TerminalInput extends AsyncDisposable {}
  export interface Interface {}
}

export namespace WasiCliTerminalOutput {
  export interface TerminalOutput extends AsyncDisposable {}
  export interface Interface {}
}

export namespace WasiCliTerminalStdin {
  export type TerminalInput = WasiCliTerminalInput.TerminalInput;
  export interface Interface {
    getTerminalStdin(): Own<TerminalInput> | undefined;
  }
}

export namespace WasiCliTerminalStdout {
  export type TerminalOutput = WasiCliTerminalOutput.TerminalOutput;
  export interface Interface {
    getTerminalStdout(): Own<TerminalOutput> | undefined;
  }
}

export namespace WasiCliTerminalStderr {
  export type TerminalOutput = WasiCliTerminalOutput.TerminalOutput;
  export interface Interface {
    getTerminalStderr(): Own<TerminalOutput> | undefined;
  }
}

export namespace WasiHttpTypes {
  export type Duration = WasiClocksTypes.Duration;
  export type Method =
    | { readonly tag: 'get' }
    | { readonly tag: 'head' }
    | { readonly tag: 'post' }
    | { readonly tag: 'put' }
    | { readonly tag: 'delete' }
    | { readonly tag: 'connect' }
    | { readonly tag: 'options' }
    | { readonly tag: 'trace' }
    | { readonly tag: 'patch' }
    | { readonly tag: 'other'; readonly val: string };
  export type Scheme =
    | { readonly tag: 'HTTP' }
    | { readonly tag: 'HTTPS' }
    | { readonly tag: 'other'; readonly val: string };
  export type DNSErrorPayload = {
    readonly rcode: string | undefined;
    readonly infoCode: U16 | undefined;
  };
  export type TLSAlertReceivedPayload = {
    readonly alertId: U8 | undefined;
    readonly alertMessage: string | undefined;
  };
  export type FieldSizePayload = {
    readonly fieldName: string | undefined;
    readonly fieldSize: U32 | undefined;
  };
  export type ErrorCode =
    | { readonly tag: 'DNS-timeout' }
    | { readonly tag: 'DNS-error'; readonly val: DNSErrorPayload }
    | { readonly tag: 'destination-not-found' }
    | { readonly tag: 'destination-unavailable' }
    | { readonly tag: 'destination-IP-prohibited' }
    | { readonly tag: 'destination-IP-unroutable' }
    | { readonly tag: 'connection-refused' }
    | { readonly tag: 'connection-terminated' }
    | { readonly tag: 'connection-timeout' }
    | { readonly tag: 'connection-read-timeout' }
    | { readonly tag: 'connection-write-timeout' }
    | { readonly tag: 'connection-limit-reached' }
    | { readonly tag: 'TLS-protocol-error' }
    | { readonly tag: 'TLS-certificate-error' }
    | { readonly tag: 'TLS-alert-received'; readonly val: TLSAlertReceivedPayload }
    | { readonly tag: 'HTTP-request-denied' }
    | { readonly tag: 'HTTP-request-length-required' }
    | { readonly tag: 'HTTP-request-body-size'; readonly val: U64 | undefined }
    | { readonly tag: 'HTTP-request-method-invalid' }
    | { readonly tag: 'HTTP-request-URI-invalid' }
    | { readonly tag: 'HTTP-request-URI-too-long' }
    | { readonly tag: 'HTTP-request-header-section-size'; readonly val: U32 | undefined }
    | { readonly tag: 'HTTP-request-header-size'; readonly val: FieldSizePayload | undefined }
    | { readonly tag: 'HTTP-request-trailer-section-size'; readonly val: U32 | undefined }
    | { readonly tag: 'HTTP-request-trailer-size'; readonly val: FieldSizePayload }
    | { readonly tag: 'HTTP-response-incomplete' }
    | { readonly tag: 'HTTP-response-header-section-size'; readonly val: U32 | undefined }
    | { readonly tag: 'HTTP-response-header-size'; readonly val: FieldSizePayload }
    | { readonly tag: 'HTTP-response-body-size'; readonly val: U64 | undefined }
    | { readonly tag: 'HTTP-response-trailer-section-size'; readonly val: U32 | undefined }
    | { readonly tag: 'HTTP-response-trailer-size'; readonly val: FieldSizePayload }
    | { readonly tag: 'HTTP-response-transfer-coding'; readonly val: string | undefined }
    | { readonly tag: 'HTTP-response-content-coding'; readonly val: string | undefined }
    | { readonly tag: 'HTTP-response-timeout' }
    | { readonly tag: 'HTTP-upgrade-failed' }
    | { readonly tag: 'HTTP-protocol-error' }
    | { readonly tag: 'loop-detected' }
    | { readonly tag: 'configuration-error' }
    | { readonly tag: 'internal-error'; readonly val: string | undefined };
  export type HeaderError =
    | { readonly tag: 'invalid-syntax' }
    | { readonly tag: 'forbidden' }
    | { readonly tag: 'immutable' }
    | { readonly tag: 'size-exceeded' }
    | { readonly tag: 'other'; readonly val: string | undefined };
  export type RequestOptionsError =
    | { readonly tag: 'not-supported' }
    | { readonly tag: 'immutable' }
    | { readonly tag: 'other'; readonly val: string | undefined };
  export type FieldName = string;
  export type FieldValue = Uint8Array;
  export interface Fields extends AsyncDisposable {
    get(name: FieldName): readonly FieldValue[];
    has(name: FieldName): boolean;
    set(name: FieldName, value: readonly FieldValue[]): Result<void, HeaderError>;
    delete(name: FieldName): Result<void, HeaderError>;
    getAndDelete(name: FieldName): Result<readonly FieldValue[], HeaderError>;
    append(name: FieldName, value: FieldValue): Result<void, HeaderError>;
    copyAll(): readonly (readonly [FieldName, FieldValue])[];
    clone(): Own<Fields>;
  }
  export type Headers = Fields;
  export type Trailers = Fields;
  export interface Request extends AsyncDisposable {
    getMethod(): Method;
    setMethod(method: Method): Result<void, void>;
    getPathWithQuery(): string | undefined;
    setPathWithQuery(pathWithQuery: string | undefined): Result<void, void>;
    getScheme(): Scheme | undefined;
    setScheme(scheme: Scheme | undefined): Result<void, void>;
    getAuthority(): string | undefined;
    setAuthority(authority: string | undefined): Result<void, void>;
    getOptions(): Own<RequestOptions> | undefined;
    getHeaders(): Own<Headers>;
  }
  export interface RequestOptions extends AsyncDisposable {
    getConnectTimeout(): Duration | undefined;
    setConnectTimeout(duration: Duration | undefined): Result<void, RequestOptionsError>;
    getFirstByteTimeout(): Duration | undefined;
    setFirstByteTimeout(duration: Duration | undefined): Result<void, RequestOptionsError>;
    getBetweenBytesTimeout(): Duration | undefined;
    setBetweenBytesTimeout(duration: Duration | undefined): Result<void, RequestOptionsError>;
    clone(): Own<RequestOptions>;
  }
  export type StatusCode = U16;
  export interface Response extends AsyncDisposable {
    getStatusCode(): StatusCode;
    setStatusCode(statusCode: StatusCode): Result<void, void>;
    getHeaders(): Own<Headers>;
  }
  export interface Interface {
    readonly fields: {
      'new'(): Own<Fields>;
      fromList(
        entries: readonly (readonly [FieldName, FieldValue])[],
      ): Result<Own<Fields>, HeaderError>;
    };
    readonly request: {
      'new'(
        headers: Own<Headers>,
        contents: Stream<U8> | undefined,
        trailers: Future<Result<Own<Trailers> | undefined, ErrorCode>>,
        options: Own<RequestOptions> | undefined,
      ): readonly [Own<Request>, Future<Result<void, ErrorCode>>];
      consumeBody(
        this: Own<Request>,
        res: Future<Result<void, ErrorCode>>,
      ): readonly [Stream<U8>, Future<Result<Own<Trailers> | undefined, ErrorCode>>];
    };
    readonly requestOptions: { 'new'(): Own<RequestOptions> };
    readonly response: {
      'new'(
        headers: Own<Headers>,
        contents: Stream<U8> | undefined,
        trailers: Future<Result<Own<Trailers> | undefined, ErrorCode>>,
      ): readonly [Own<Response>, Future<Result<void, ErrorCode>>];
      consumeBody(
        this: Own<Response>,
        res: Future<Result<void, ErrorCode>>,
      ): readonly [Stream<U8>, Future<Result<Own<Trailers> | undefined, ErrorCode>>];
    };
  }
}

export namespace WasiHttpHandler {
  export type Request = WasiHttpTypes.Request;
  export type Response = WasiHttpTypes.Response;
  export type ErrorCode = WasiHttpTypes.ErrorCode;
  export interface Interface {
    handle(request: Own<Request>): Promise<Result<Own<Response>, ErrorCode>>;
  }
}

export namespace WasiHttpClient {
  export type Request = WasiHttpTypes.Request;
  export type Response = WasiHttpTypes.Response;
  export type ErrorCode = WasiHttpTypes.ErrorCode;
  export interface Interface {
    send(request: Own<Request>): Promise<Result<Own<Response>, ErrorCode>>;
  }
}

export namespace WalosRuntimeIo {
  export type ErrorCode = WasiCliTypes.ErrorCode;
  export type Descriptor = WasiFilesystemTypes.Descriptor;
  export type Filesize = WasiFilesystemTypes.Filesize;
  export type FilesystemError = WasiFilesystemTypes.ErrorCode;
  export interface InputEndpoint extends AsyncDisposable {
    readViaStream(): readonly [Stream<U8>, Future<Result<void, ErrorCode>>];
  }
  export interface OutputEndpoint extends AsyncDisposable {
    whenWritable(minimum: U64): Future<Result<U64, ErrorCode>>;
    writeViaStream(data: Stream<U8>): Future<Result<void, ErrorCode>>;
  }
  export interface Interface {
    readViaDescriptor(
      file: Borrow<Descriptor>,
      offset: Filesize,
    ): Promise<Result<Own<InputEndpoint>, FilesystemError>>;
    writeViaDescriptor(
      file: Borrow<Descriptor>,
      offset: Filesize,
      append: boolean,
    ): Promise<Result<Own<OutputEndpoint>, FilesystemError>>;
    getStdin(): Own<InputEndpoint>;
    getStdout(): Own<OutputEndpoint>;
    getStderr(): Own<OutputEndpoint>;
    createPipe(): Promise<readonly [Own<InputEndpoint>, Own<OutputEndpoint>]>;
  }
}

export namespace WalosRuntimeProcess {
  export type Descriptor = WasiFilesystemTypes.Descriptor;
  export type InputEndpoint = WalosRuntimeIo.InputEndpoint;
  export type OutputEndpoint = WalosRuntimeIo.OutputEndpoint;
  export type SpawnError =
    | { readonly tag: 'invalid-descriptor' }
    | { readonly tag: 'invalid-stream' }
    | { readonly tag: 'initialization'; readonly val: string }
    | { readonly tag: 'timeout' }
    | { readonly tag: 'cancelled' }
    | { readonly tag: 'busy' }
    | { readonly tag: 'internal'; readonly val: string };
  export type ExitResult =
    | { readonly tag: 'exited'; readonly val: U32 }
    | { readonly tag: 'trap'; readonly val: string }
    | { readonly tag: 'terminated'; readonly val: string };
  export type WaitError = { readonly tag: 'already-consumed' };
  export interface ChildProcess extends AsyncDisposable {
    pid(): U32;
    wait(): Promise<Result<ExitResult, WaitError>>;
    requestStop(): Promise<void>;
  }
  export interface Interface {
    spawn(
      executable: Borrow<Descriptor>,
      argv: readonly string[],
      env: readonly (readonly [string, string])[],
      stdin: Own<InputEndpoint> | undefined,
      stdout: Own<OutputEndpoint> | undefined,
      stderr: Own<OutputEndpoint> | undefined,
    ): Promise<Result<Own<ChildProcess>, SpawnError>>;
  }
}

export interface WasiImports {
  readonly clocks: {
    readonly types: WasiClocksTypes.Interface;
    readonly monotonicClock: WasiClocksMonotonicClock.Interface;
    readonly systemClock: WasiClocksSystemClock.Interface;
    readonly timezone: WasiClocksTimezone.Interface;
  };
  readonly filesystem: {
    readonly types: WasiFilesystemTypes.Interface;
    readonly preopens: WasiFilesystemPreopens.Interface;
  };
  readonly sockets: {
    readonly types: WasiSocketsTypes.Interface;
    readonly ipNameLookup: WasiSocketsIpNameLookup.Interface;
  };
  readonly random: {
    readonly insecureSeed: WasiRandomInsecureSeed.Interface;
    readonly insecure: WasiRandomInsecure.Interface;
    readonly random: WasiRandomRandom.Interface;
  };
  readonly cli: {
    readonly environment: WasiCliEnvironment.Interface;
    readonly exit: WasiCliExit.Interface;
    readonly types: WasiCliTypes.Interface;
    readonly stdin: WasiCliStdin.Interface;
    readonly stdout: WasiCliStdout.Interface;
    readonly stderr: WasiCliStderr.Interface;
    readonly terminalInput: WasiCliTerminalInput.Interface;
    readonly terminalOutput: WasiCliTerminalOutput.Interface;
    readonly terminalStdin: WasiCliTerminalStdin.Interface;
    readonly terminalStdout: WasiCliTerminalStdout.Interface;
    readonly terminalStderr: WasiCliTerminalStderr.Interface;
  };
  readonly http: {
    readonly types: WasiHttpTypes.Interface;
    readonly handler: WasiHttpHandler.Interface;
    readonly client: WasiHttpClient.Interface;
  };
}

export interface WalosImports {
  readonly runtime: {
    readonly io: WalosRuntimeIo.Interface;
    readonly process: WalosRuntimeProcess.Interface;
  };
}
