import { ServiceError } from '../types.js';
import type { Result, WasiHttpTypes as HTTP } from '../wasi-types.js';

export class HttpRequestOptions implements HTTP.RequestOptions {
  private live = true;
  constructor(
    private between?: bigint,
    private immutable = false,
    private release = () => {},
    private network?: { connect?: bigint; first?: bigint },
  ) {}
  private check() {
    if (!this.live)
      throw new ServiceError('invalid-resource', 'HTTP options were moved or disposed');
  }
  private set(
    value: bigint | undefined,
    supported: boolean,
  ): Result<void, HTTP.RequestOptionsError> {
    this.check();
    if (this.immutable) return { tag: 'err', val: { tag: 'immutable' } };
    if (!supported && value !== undefined) return { tag: 'err', val: { tag: 'not-supported' } };
    if (value !== undefined && (value < 0n || value > 0xffffffffffffffffn))
      throw new ServiceError('invalid', 'Invalid HTTP timeout duration');
    return { tag: 'ok', val: undefined };
  }
  getConnectTimeout() {
    this.check();
    return this.network?.connect;
  }
  setConnectTimeout(value: bigint | undefined) {
    const result = this.set(value, this.network !== undefined);
    if (result.tag === 'ok' && this.network) this.network.connect = value;
    return result;
  }
  getFirstByteTimeout() {
    this.check();
    return this.network?.first;
  }
  setFirstByteTimeout(value: bigint | undefined) {
    const result = this.set(value, this.network !== undefined);
    if (result.tag === 'ok' && this.network) this.network.first = value;
    return result;
  }
  getBetweenBytesTimeout() {
    this.check();
    return this.between;
  }
  setBetweenBytesTimeout(value: bigint | undefined) {
    const result = this.set(value, true);
    if (result.tag === 'ok') this.between = value;
    return result;
  }
  copyNetworkTimeouts() {
    return this.network && { ...this.network };
  }
  clone() {
    this.check();
    return new HttpRequestOptions(this.between, false, () => {}, this.copyNetworkTimeouts());
  }
  view(release: () => void) {
    this.check();
    return new HttpRequestOptions(this.between, true, release, this.copyNetworkTimeouts());
  }
  move() {
    const result = this.clone();
    this.live = false;
    this.release();
    return result;
  }
  async [Symbol.asyncDispose]() {
    if (!this.live) return;
    this.live = false;
    this.release();
  }
}
