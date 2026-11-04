import { ServiceError } from '../types.js';
import type { Result, WasiHttpTypes as HTTP } from '../wasi-types.js';
import { HttpBody } from './http-body.js';
import { HttpFields } from './http-fields.js';
import { HttpRequestOptions } from './http-options.js';

const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const authoritySyntax =
  /^(?:[A-Za-z0-9._~!$&'()*+,;=:%-]*@)?(?:\[[A-Za-z0-9:.~-]+\]|[A-Za-z0-9._~!$&'()*+,;=%-]*)(?::[0-9]*)?$/;
const invalidEscape = /%(?![a-fA-F0-9]{2})/;
const result = (valid: boolean): Result<void, void> =>
  valid ? { tag: 'ok', val: undefined } : { tag: 'err', val: undefined };

class Message implements AsyncDisposable {
  protected live = true;
  constructor(
    readonly headers: HttpFields,
    readonly body: HttpBody,
  ) {}
  protected check() {
    if (!this.live)
      throw new ServiceError('invalid-resource', 'HTTP message was moved or disposed');
  }
  move() {
    this.check();
    this.live = false;
  }
  getHeaders() {
    this.check();
    return new HttpFields(this.headers.copyAll(), true);
  }
  async [Symbol.asyncDispose]() {
    if (!this.live) return;
    this.live = false;
    await this.body[Symbol.asyncDispose]();
    await this.headers[Symbol.asyncDispose]();
  }
}

export class HttpRequest extends Message implements HTTP.Request {
  private method: HTTP.Method = { tag: 'get' };
  private path?: string;
  private scheme?: HTTP.Scheme;
  private authority?: string;
  private children = 0;
  constructor(
    headers: HttpFields,
    body: HttpBody,
    readonly options?: HttpRequestOptions,
  ) {
    super(headers, body);
  }
  override move() {
    if (this.children)
      throw new ServiceError('busy', 'Drop HTTP request options before transferring request');
    super.move();
  }
  consume() {
    // consume-body explicitly allows existing child options to remain valid.
    super.move();
    return this.body;
  }
  getMethod() {
    this.check();
    return { ...this.method };
  }
  setMethod(value: HTTP.Method) {
    this.check();
    if (value.tag === 'other' && !token.test(value.val)) return result(false);
    this.method = { ...value };
    return result(true);
  }
  getPathWithQuery() {
    this.check();
    return this.path;
  }
  setPathWithQuery(value: string | undefined) {
    this.check();
    if (
      value !== undefined &&
      (!/^(?:\/[A-Za-z0-9._~!$&'()*+,;=:@/%?-]*|\*|)$/.test(value) || invalidEscape.test(value))
    )
      return result(false);
    this.path = value;
    return result(true);
  }
  getScheme() {
    this.check();
    return this.scheme && { ...this.scheme };
  }
  setScheme(value: HTTP.Scheme | undefined) {
    this.check();
    if (value?.tag === 'other' && !/^[A-Za-z][A-Za-z0-9+.-]*$/.test(value.val))
      return result(false);
    this.scheme = value && { ...value };
    return result(true);
  }
  getAuthority() {
    this.check();
    return this.authority;
  }
  setAuthority(value: string | undefined) {
    this.check();
    if (value !== undefined && (!authoritySyntax.test(value) || invalidEscape.test(value)))
      return result(false);
    this.authority = value;
    return result(true);
  }
  getOptions() {
    this.check();
    if (!this.options) return undefined;
    this.children++;
    return this.options.view(() => {
      this.children--;
    });
  }
  override async [Symbol.asyncDispose]() {
    if (this.live && this.children)
      throw new ServiceError('busy', 'Drop HTTP request options before dropping request');
    await super[Symbol.asyncDispose]();
  }
}

export class HttpResponse extends Message implements HTTP.Response {
  constructor(
    headers: HttpFields,
    body: HttpBody,
    private status = 200,
  ) {
    super(headers, body);
  }
  getStatusCode() {
    this.check();
    return this.status;
  }
  setStatusCode(value: number) {
    this.check();
    if (!Number.isInteger(value) || value < 100 || value > 599) return result(false);
    this.status = value;
    return result(true);
  }
}
