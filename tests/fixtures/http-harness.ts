import { Future, createStream, type WasiHttpTypes as HTTP } from '../../packages/os/dist/index.js';
import { Walos, HostProcessContext, install, run } from './host-harness.js';
export { Walos, HostProcessContext, install, run, Future, createStream };
export async function setup() {
  const os = await Walos.create({
    storage: await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('http-services', { create: true }),
  });
  const host = new HostProcessContext(os.getHostProcess());
  const executable = await install(host, 'p3-http-service');
  const middleware = await install(host, 'p3-http-middleware');
  return { os, host, executable, middleware, types: host.context.wasi.http.types };
}
export function request(
  types: HTTP.Interface,
  path = '/',
  authority = 'localhost:3000',
  contents?: import('../../packages/os/dist/index.js').Stream<number>,
  trailers?: Future<
    import('../../packages/os/dist/index.js').Result<HTTP.Fields | undefined, HTTP.ErrorCode>
  >,
  headers?: HTTP.Fields,
) {
  const [value, sent] = types.request.new(
    headers ?? types.fields.new(),
    contents,
    trailers ?? new Future({ tag: 'ok', val: undefined }),
    undefined,
  );
  value.setScheme({ tag: 'HTTP' });
  value.setAuthority(authority);
  value.setPathWithQuery(path);
  return { value, sent };
}
export async function read(
  types: HTTP.Interface,
  reply: import('../../packages/os/dist/index.js').Result<HTTP.Response, HTTP.ErrorCode>,
) {
  if (reply.tag === 'err') throw new Error(JSON.stringify(reply.val));
  const status = reply.val.getStatusCode();
  const headers = reply.val.getHeaders();
  const fields = headers.copyAll();
  await headers[Symbol.asyncDispose]();
  let done!: (
    value: import('../../packages/os/dist/index.js').Result<void, HTTP.ErrorCode>,
  ) => void;
  const [stream, trailers] = types.response.consumeBody(
    reply.val,
    new Future(
      new Promise((resolve) => {
        done = resolve;
      }),
    ),
  );
  const chunks: number[] = [];
  for (;;) {
    const bytes = await stream.read(65536);
    if (bytes === undefined) break;
    chunks.push(...bytes);
  }
  const ending = await trailers;
  const trailerFields = ending.tag === 'ok' ? ending.val?.copyAll() : undefined;
  if (ending.tag === 'ok') await ending.val?.[Symbol.asyncDispose]();
  done(ending.tag === 'err' ? ending : { tag: 'ok', val: undefined });
  await new Promise((resolve) => setTimeout(resolve, 10));
  return {
    status,
    ending: ending.tag === 'err' ? ending.val : undefined,
    headers: fields.map(([k, v]) => [k, Array.from(v)]),
    trailers: trailerFields?.map(([k, v]) => [k, Array.from(v)]),
    bytes: chunks,
  };
}
