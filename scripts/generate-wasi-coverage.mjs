import { readFileSync, writeFileSync } from 'node:fs';
const api = JSON.parse(readFileSync('wit/p3/api.json', 'utf8'));
const rows = api.interfaces.flatMap((iface) =>
  iface.operations.map((operation) => {
    let status = 'implemented';
    if (iface.package === 'wasi:cli' && iface.interface === 'run')
      status = 'Runtime entrypoint (native async)';
    else if (iface.package === 'wasi:http' && iface.interface === 'handler') status = 'Trap';
    else if (iface.package === 'wasi:sockets') status = 'backend-dependent';
    else if (
      iface.package === 'wasi:http' &&
      (iface.interface === 'client' || /timeout/.test(operation.wit))
    )
      status = 'partial';
    else if (iface.package === 'wasi:filesystem' && operation.wit.endsWith('.open-at'))
      status = 'partial';
    return {
      interface: `${iface.package}/${iface.interface}@0.3.2`,
      operation: operation.wit,
      status,
    };
  }),
);
const text =
  `# WASI 0.3.2 coverage\n\nSource: official tag v0.3.2, commit \`${api.upstream}\`. The source WIT is pinned in\n\`wit/p3/deps\`; \`api.json\` inventories every type, function, async signature and\nresource. Generated bindings are a comparison/ABI reference, not the public Context.\n\nAll ${api.interfaces.length} interfaces and ${rows.length} operations have public TS types. CLI run\nis an export/Runtime entrypoint, not an OS import on Context. The optional timezone\nfeature uses browser Intl data; unavailable IDs or offsets return none. Offsets are limited to the JavaScript Date range. Type-only interfaces and all named\ntypes are included in the API inventory even when they have no operation row.\n\nTrap means the shared Context throws UnimplementedWasiError with the WIT operation\npath. No unsupported success or invented Result variant is returned. Sockets use a process-local injected backend; without one, creation and host-name\nlookup return access-denied. IP literals are parsed locally. Backend-dependent\nmeans transport, options and authorization depend on the configured backend.\nSee [Sockets backend](sockets-backend.md) for the contract and test coverage.\nHTTP resources and client sending are implemented; handler.handle still traps.\nSee [HTTP transport limitations](wasi-p3-http.md).\n\nFilesystem uses a versioned logical namespace in caller-provided dedicated OPFS storage.\nHard/symbolic links and timestamp mutation share object metadata across Host/P1/P2/P3.\nAdvice is an intentional no-op. Integrity-sync open flags return unsupported.\nSee [filesystem storage contract](filesystem-storage.md) for durability, timestamp\nand concurrency limits. No built-in external socket transport is implemented.\n\nWalos io endpoints are owned transfer capabilities. Their data operations use P3\nstream/future values; when-writable exposes a capacity Future, with a minimum\nthreshold, to preserve real Pipe backpressure in P1/P2 and Host conversions. The\ndescriptor-to-endpoint factories support moving file stdio without moving its\nborrowed descriptor. Native P1/P2 representations stay in ABI adapters.\n\n| Interface | Operation | Status |\n| --- | --- | --- |\n` +
  rows.map((row) => `| ${row.interface} | ${row.operation} | ${row.status} |`).join('\n') +
  '\n';
if (process.argv.includes('--check')) {
  if (readFileSync('docs/wasi-p3-coverage.md', 'utf8') !== text)
    throw Error('Stale coverage document');
} else writeFileSync('docs/wasi-p3-coverage.md', text);
