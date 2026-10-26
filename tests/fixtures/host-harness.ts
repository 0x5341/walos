import {
  Walos,
  ServiceError,
  type FileDescriptor,
  type InputStream,
  type OutputStream,
  type ProcessContext,
} from '../../packages/os/dist/index.js';
export { Walos, ServiceError };
export async function install(host: ProcessContext, name: string, path = name) {
  const [[root]] = host.fs.getDirectories();
  const file = await root.openAt(
    {},
    path,
    { create: true, truncate: true },
    { read: true, write: true },
  );
  const response = await fetch(`/bin/${name}.wasm`);
  if (!response.ok) throw new Error(`Missing fixture: ${name}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const output = await file.writeViaStream(0n);
  await writeAll(output, bytes);
  await output[Symbol.asyncDispose]();
  await root[Symbol.asyncDispose]();
  return file;
}
export async function writeAll(output: OutputStream, bytes: Uint8Array) {
  let position = 0;
  while (position < bytes.length) {
    const poll = output.subscribe();
    await poll.block();
    await poll[Symbol.asyncDispose]();
    const count = Math.min(Number(output.checkWrite()), bytes.length - position);
    await output.write(bytes.subarray(position, position + count));
    position += count;
  }
  await output.blockingFlush();
}
export async function readAll(input: InputStream) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const bytes = await input.blockingRead(65536n);
      chunks.push(bytes);
      total += bytes.length;
    }
  } catch (e) {
    if (!(e instanceof ServiceError) || e.code !== 'closed') throw e;
  }
  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.length;
  }
  await input[Symbol.asyncDispose]();
  return bytes;
}
export async function run(
  host: ProcessContext,
  exe: FileDescriptor,
  argv: string[],
  env = [{ key: 'PWD', value: '/' }],
) {
  const [out, writer] = await host.io.createPipe();
  const [err, errorWriter] = await host.io.createPipe();
  const stdout = readAll(out),
    stderr = readAll(err);
  const child = await host.process.spawn(exe, argv, env, undefined, writer, errorWriter);
  const pid = child.pid(),
    exit = await child.wait();
  await child[Symbol.asyncDispose]();
  return {
    pid,
    exit,
    stdout: new TextDecoder().decode(await stdout),
    stderr: new TextDecoder().decode(await stderr),
  };
}
