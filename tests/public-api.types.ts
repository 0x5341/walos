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
  await using os = await Walos.create({ env: { PWD: '/' }, argv: [] });
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
