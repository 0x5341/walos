import { ServiceError } from '../types.js';
import type { Result, WasiHttpTypes as HTTP } from '../wasi-types.js';

const validName = (name: string) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name);
const validValue = (value: Uint8Array) =>
  !value.some((byte) => byte === 127 || (byte < 32 && byte !== 9));
const ok = <T>(val: T): Result<T, HTTP.HeaderError> => ({ tag: 'ok', val });
const err = (tag: HTTP.HeaderError['tag']): Result<never, HTTP.HeaderError> =>
  ({ tag: 'err', val: { tag } }) as Result<never, HTTP.HeaderError>;

/** Preserve WASI field bytes, casing and order independently of Fetch Headers. */
export class HttpFields implements HTTP.Fields {
  private live = true;
  private entries: [string, Uint8Array][];
  constructor(
    entries: readonly (readonly [string, Uint8Array])[] = [],
    private immutable = false,
  ) {
    this.entries = entries.map(([name, value]) => [name, value.slice()]);
  }
  private check() {
    if (!this.live)
      throw new ServiceError('invalid-resource', 'HTTP fields were moved or disposed');
  }
  static fromList(
    entries: readonly (readonly [string, Uint8Array])[],
  ): Result<HttpFields, HTTP.HeaderError> {
    if (entries.some(([name, value]) => !validName(name) || !validValue(value)))
      return err('invalid-syntax');
    return ok(new HttpFields(entries));
  }
  get(name: string): readonly Uint8Array[] {
    this.check();
    return this.entries
      .filter(([key]) => key.toLowerCase() === name.toLowerCase())
      .map(([, value]) => value.slice());
  }
  has(name: string) {
    this.check();
    return (
      validName(name) && this.entries.some(([key]) => key.toLowerCase() === name.toLowerCase())
    );
  }
  private validate(name: string, values: readonly Uint8Array[]) {
    this.check();
    if (this.immutable) return err('immutable');
    if (!validName(name) || values.some((value) => !validValue(value)))
      return err('invalid-syntax');
    return ok(undefined);
  }
  set(name: string, values: readonly Uint8Array[]) {
    const result = this.validate(name, values);
    if (result.tag === 'err') return result;
    this.entries = this.entries.filter(([key]) => key.toLowerCase() !== name.toLowerCase());
    this.entries.push(...values.map((value): [string, Uint8Array] => [name, value.slice()]));
    return ok(undefined);
  }
  delete(name: string) {
    return this.set(name, []);
  }
  getAndDelete(name: string): Result<readonly Uint8Array[], HTTP.HeaderError> {
    const values = this.get(name);
    const result = this.delete(name);
    return result.tag === 'err' ? result : ok(values);
  }
  append(name: string, value: Uint8Array) {
    const result = this.validate(name, [value]);
    if (result.tag === 'err') return result;
    this.entries.push([name, value.slice()]);
    return ok(undefined);
  }
  copyAll(): readonly (readonly [string, Uint8Array])[] {
    this.check();
    return this.entries.map(([name, value]) => [name, value.slice()] as const);
  }
  clone() {
    return new HttpFields(this.copyAll());
  }
  move(): HttpFields {
    const result = new HttpFields(this.copyAll(), this.immutable);
    this.live = false;
    this.entries = [];
    return result;
  }
  async [Symbol.asyncDispose]() {
    this.live = false;
    this.entries = [];
  }
}
