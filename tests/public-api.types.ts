import {
  Walos,
  HostProcessContext,
  ServiceError,
  type HostChildProcess as ChildProcess,
  type HostInput as InputStream,
  type HostOutput as OutputStream,
  type ProcessContext,
  type HostDescriptor as FileDescriptor,
} from '@walos/os';
export async function publicExample(executable: FileDescriptor) {
  // @ts-expect-error storage is required at initialization
  Walos.create();
  // @ts-expect-error env alone does not select dedicated storage
  Walos.create({ env: {} });
  await using os = await Walos.create({
    storage: await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('walos-v1', { create: true }),
    env: { PWD: '/' },
    argv: [],
  });
  const raw: ProcessContext = os.getHostProcess();
  const host = new HostProcessContext(raw);
  // @ts-expect-error old P2-based Context grouping has been removed
  raw.fs;
  // @ts-expect-error Host convenience grouping requires the explicit wrapper
  raw.io;
  const [[root]] = host.fs.getDirectories();
  await using input = await root.openAt({}, 'app.wasm', {}, { read: true });
  const [reader, writer] = await host.io.createPipe();
  const stdout: OutputStream = writer;
  const stdin: InputStream = reader;
  await using child: ChildProcess = await host.process.spawn(executable, [], [], undefined, stdout);
  await child.requestStop();
  const exit = await child.wait();
  if (exit.kind === 'exited') console.log(exit.code);
  await stdin[Symbol.asyncDispose]();
  // @ts-expect-error constructor is private
  new Walos();
  // @ts-expect-error no boot
  os.boot();
  // @ts-expect-error no attach
  os.attach();
  // @ts-expect-error no terminal control
  os.interrupt();
  // @ts-expect-error no cwd field
  host.cwd;
  // @ts-expect-error readonly env
  host.env.set('A', 'B');
  // @ts-expect-error readonly args
  host.args.push('x');
  // @ts-expect-error no child stdio getters
  child.stdout;
  // @ts-expect-error raw spawn requires descriptor
  host.process.spawn('/bin/app', [], []);
  // @ts-expect-error no public synchronous disposal
  input[Symbol.dispose]();
  // @ts-expect-error no public close
  input.close();
  // @ts-expect-error no browser handle in the public resource
  input.data.file;
  host.process.spawn(
    executable,
    [],
    [],
    undefined,
    undefined,
    undefined,
    // @ts-expect-error no spawn AbortSignal
    new AbortController().signal,
  );
  const error = new ServiceError('closed', 'EOF');
  console.log(error.code, error.cause);
}

export async function socketBackendExample(options: import('@walos/os').SocketBackendOptions) {
  await using os = await Walos.create({
    storage: await navigator.storage.getDirectory(),
    sockets: options,
  });
  const created = os.getHostProcess().wasi.sockets.types.tcpSocket.create('ipv4');
  if (created.tag === 'ok') await created.val[Symbol.asyncDispose]();
}
const createSocketBackend: (
  init: import('@walos/os').SocketBackendInit,
) => Promise<import('@walos/os').SocketBackend> = async (init) => ({
  types: {
    tcpSocket: { create: () => ({ tag: 'err', val: { tag: 'not-supported' } }) },
    udpSocket: { create: () => ({ tag: 'err', val: { tag: 'not-supported' } }) },
  },
  ipNameLookup: { resolveAddresses: async () => ({ tag: 'err', val: { tag: 'access-denied' } }) },
  async [Symbol.asyncDispose]() {
    if (init.signal.aborted) return;
  },
});
void createSocketBackend;

export async function publicHttpExample(context: ProcessContext) {
  const { Future } = await import('@walos/os');
  const http = context.wasi.http;
  const [request, sent] = http.types.request.new(
    http.types.fields.new(),
    undefined,
    new Future({ tag: 'ok', val: undefined }),
    undefined,
  );
  request.setScheme({ tag: 'HTTPS' });
  request.setAuthority('example.com');
  const reply = await http.client.send(request);
  if (reply.tag === 'ok') {
    const [body, trailers] = http.types.response.consumeBody(
      reply.val,
      new Future({ tag: 'ok', val: undefined }),
    );
    while (await body.read(65536)) {}
    const result = await trailers;
    if (result.tag === 'ok') await result.val?.[Symbol.asyncDispose]();
  }
  await sent;
}

export async function httpServiceExample(host: HostProcessContext, executable: FileDescriptor) {
  await using service: import('@walos/os').HostHttpService = await host.http.start(executable);
  await using entry = await host.http.start(executable, {
    next: service,
    listen: { port: 3000, path: '/api' },
    argv: [],
    env: [{ key: 'PWD', value: '/' }],
  });
  const { Future } = await import('@walos/os');
  const types = host.context.wasi.http.types;
  const [request] = types.request.new(
    types.fields.new(),
    undefined,
    new Future({ tag: 'ok', val: undefined }),
    undefined,
  );
  await entry.handle(request, { signal: new AbortController().signal });
  await entry.requestStop();
  const exit = await entry.wait();
  console.log(exit, entry.pid());
  // @ts-expect-error HTTP execution borrows an executable descriptor, not a path
  host.http.start('/bin/service.wasm');
  // @ts-expect-error middleware next must be a service handle
  host.http.start(executable, { next: 123 });
}

export const customFetchFactory: import('@walos/os').HttpFetchFactory = async (init) => ({
  fetch: (url, options) =>
    fetch(url, {
      ...options,
      signal: AbortSignal.any([init.signal, ...(options.signal ? [options.signal] : [])]),
    }),
  async [Symbol.asyncDispose]() {},
});
const socketHttp: import('@walos/os').HttpSocketsOptions = {
  transport: 'sockets',
  module: 'https://example.invalid/http-transport.js',
  config: { additionalCa: 'PEM' },
};
void socketHttp;
