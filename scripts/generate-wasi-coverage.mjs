import { readFileSync, writeFileSync } from 'node:fs';
const api = JSON.parse(readFileSync('wit/p3/api.json', 'utf8'));
const unsupported = new Set(['set-times', 'set-times-at', 'link-at', 'readlink-at', 'symlink-at']);
const rows = api.interfaces.flatMap((iface) =>
  iface.operations.map((operation) => {
    let status = 'implemented';
    if (iface.package === 'wasi:cli' && iface.interface === 'run')
      status = 'Runtime entrypoint (native async)';
    else if (
      iface.package === 'wasi:http' ||
      iface.package === 'wasi:sockets' ||
      (iface.package === 'wasi:clocks' && iface.interface === 'timezone')
    )
      status = 'Trap';
    else if (
      iface.package === 'wasi:filesystem' &&
      unsupported.has(operation.wit.split('.').at(-1))
    )
      status = 'Trap';
    else if (
      iface.package === 'wasi:filesystem' &&
      ['advise', 'open-at', 'stat', 'stat-at', 'metadata-hash', 'metadata-hash-at'].includes(
        operation.wit.split('.').at(-1),
      )
    )
      status = 'partial';
    return {
      interface: `${iface.package}/${iface.interface}@0.3.2`,
      operation: operation.wit,
      status,
    };
  }),
);
const text =
  `# WASI 0.3.2 coverage\n\nSource: official tag v0.3.2, commit \`${api.upstream}\`. The source WIT is pinned in\n\`wit/p3/deps\`; \`api.json\` inventories every type, function, async signature and\nresource. Generated bindings are a comparison/ABI reference, not the public Context.\n\nAll ${api.interfaces.length} interfaces and ${rows.length} operations have public TS types. CLI run\nis an export/Runtime entrypoint, not an OS import on Context. The optional timezone\nfeature in the tag is included and traps. Type-only interfaces and all named\ntypes are included in the API inventory even when they have no operation row.\n\nTrap means the shared Context throws UnimplementedWasiError with the WIT operation\npath. No unsupported success or invented Result variant is returned. HTTP/socket\nresources are not fabricated: their constructors/factories trap, so no usable\ninstances are provided. Their complete instance-method types remain public.\n\nPartial filesystem behavior uses OPFS files/directories, optional timestamps,\nadvisory no-op advice and existing unsupported flag results. Metadata hashes are\ncomputed from supported stat metadata. Hard/symbolic links and setting timestamps\ntrap. No new HTTP/socket transport is implemented.\n\nWalos io endpoints are owned transfer capabilities. Their data operations use P3\nstream/future values; when-writable exposes a capacity Future, with a minimum\nthreshold, to preserve real Pipe backpressure in P1/P2 and Host conversions. The\ndescriptor-to-endpoint factories support moving file stdio without moving its\nborrowed descriptor. Native P1/P2 representations stay in ABI adapters.\n\n| Interface | Operation | Status |\n| --- | --- | --- |\n` +
  rows.map((row) => `| ${row.interface} | ${row.operation} | ${row.status} |`).join('\n') +
  '\n';
if (process.argv.includes('--check')) {
  if (readFileSync('docs/wasi-p3-coverage.md', 'utf8') !== text)
    throw Error('Stale coverage document');
} else writeFileSync('docs/wasi-p3-coverage.md', text);
