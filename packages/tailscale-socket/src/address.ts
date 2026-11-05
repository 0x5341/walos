import type { WasiSocketsTypes as S } from '@walos/os';
export function ipAddress(value: string): S.IpAddress {
  if (!value.includes(':')) {
    const octets = value.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
      throw new Error('invalid-argument');
    return { tag: 'ipv4', val: octets as unknown as S.Ipv4Address };
  }
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left, right] = normalized.split('::');
  const head = left ? left.split(':').map((n) => parseInt(n, 16)) : [];
  const tail = right ? right.split(':').map((n) => parseInt(n, 16)) : [];
  const words =
    right === undefined
      ? head
      : [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail];
  if (words.length !== 8) throw new Error('invalid-argument');
  return { tag: 'ipv6', val: words as unknown as S.Ipv6Address };
}
export function socketAddress(value: string): S.IpSocketAddress {
  const url = new URL(`http://${value}`);
  const ip = ipAddress(url.hostname.replace(/^\[|\]$/g, ''));
  const port = Number(url.port || 80);
  return ip.tag === 'ipv4'
    ? { tag: ip.tag, val: { address: ip.val, port } }
    : { tag: ip.tag, val: { address: ip.val, port, flowInfo: 0, scopeId: 0 } };
}
export function formatAddress(value: S.IpSocketAddress): string {
  return value.tag === 'ipv4'
    ? `${value.val.address.join('.')}:${value.val.port}`
    : `[${value.val.address.map((n) => n.toString(16)).join(':')}]:${value.val.port}`;
}
