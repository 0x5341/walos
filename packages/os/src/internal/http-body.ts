import { Future, type Stream, type StreamRead } from '../async.js';
import type { Result, WasiHttpTypes as HTTP } from '../wasi-types.js';

type Completion = Result<void, HTTP.ErrorCode>;
type Trailers = Result<HTTP.Fields | undefined, HTTP.ErrorCode>;
const success: Completion = { tag: 'ok', val: undefined };
const cancelled: HTTP.ErrorCode = { tag: 'internal-error', val: 'HTTP body cancelled' };

/** Shared by the resource, consumer stream and producer completion future. */
export class HttpBody implements AsyncDisposable {
  private finish!: (result: Completion) => void;
  private trailersDone!: (result: Trailers) => void;
  private stopped!: () => void;
  private stop = new Promise<void>((resolve) => {
    this.stopped = resolve;
  });
  private result?: Completion;
  private trailerResult?: Trailers;
  private eof = false;
  private consuming = false;
  private handledResult?: Completion;
  private handling?: Future<Completion>;
  private trailersSettled = false;
  private pending?: Promise<void>;
  private chunk?: Uint8Array;
  private cleanup?: Promise<void>;
  readonly completion: Future<Completion>;
  readonly trailers: Future<Trailers>;
  readonly hasContents: boolean;
  onAbort(callback: (error: HTTP.ErrorCode) => void) {
    this.abort = callback;
  }
  constructor(
    private input: Stream<number> | undefined,
    private sourceTrailers: Future<Trailers>,
    private abort: (error: HTTP.ErrorCode) => void = () => {},
  ) {
    this.hasContents = input !== undefined;
    this.completion = new Future(
      new Promise<Completion>((resolve) => {
        this.finish = resolve;
      }),
      () => (this.result ? Promise.resolve() : this.fail(cancelled)),
    );
    this.trailers = new Future(
      new Promise<Trailers>((resolve) => {
        this.trailersDone = resolve;
      }),
      () => (this.trailersSettled ? Promise.resolve() : this.fail(cancelled)),
    );
    void Promise.resolve(sourceTrailers).then(
      (result) => {
        this.trailerResult = result;
        if (result.tag === 'err') void this.fail(result.val);
        else this.completeIfReady();
      },
      () => this.fail({ tag: 'internal-error', val: 'HTTP trailers future failed' }),
    );
  }
  private completeIfReady() {
    if (this.result || !this.eof || !this.trailerResult) return;
    this.trailersSettled = true;
    this.trailersDone(this.trailerResult);
    if (this.trailerResult.tag === 'err') this.settle(this.trailerResult);
    else if (this.handledResult) this.settle(this.handledResult);
  }
  private settle(result: Completion) {
    if (this.result) return;
    this.result = result;
    this.finish(result);
  }
  /** Application/transport reports successful handling after consuming the body. */
  handled(result: Completion) {
    if (result.tag === 'err') return this.fail(result.val);
    this.handledResult = success;
    this.completeIfReady();
    return Promise.resolve();
  }
  async fail(error: HTTP.ErrorCode): Promise<void> {
    if (this.cleanup) return this.cleanup;
    this.settle({ tag: 'err', val: error });
    this.eof = true;
    this.chunk = undefined;
    this.stopped();
    this.trailersDone({ tag: 'err', val: error });
    this.trailersSettled = true;
    this.abort(error);
    return (this.cleanup = Promise.allSettled([
      this.input?.cancel(),
      this.sourceTrailers.cancel(),
      this.handling?.cancel(),
    ]).then(() => {}));
  }
  consume(result: Future<Completion>): Stream<number> {
    if (this.consuming) throw new Error('HTTP body already consumed');
    this.consuming = true;
    this.handling = result;
    void Promise.resolve(result).then(
      (value) => this.handled(value),
      () => this.fail(cancelled),
    );
    const fetch = () => {
      if (this.chunk || this.eof) return Promise.resolve();
      return (this.pending ??= Promise.race([
        this.input ? this.input.read(65536) : Promise.resolve(undefined),
        this.stop.then(() => undefined),
      ])
        .then(
          (value) => {
            if (this.eof) return;
            if (value === undefined) {
              this.eof = true;
              this.completeIfReady();
            } else this.chunk = Uint8Array.from(value);
          },
          () => this.fail({ tag: 'HTTP-response-incomplete' }),
        )
        .finally(() => {
          this.pending = undefined;
        }));
    };
    const take = (maximum: number): StreamRead<number> => {
      if (!Number.isSafeInteger(maximum) || maximum <= 0)
        throw new RangeError('Invalid HTTP stream read size');
      if (this.chunk) {
        const value = this.chunk.slice(0, maximum);
        this.chunk = maximum >= this.chunk.length ? undefined : this.chunk.slice(maximum);
        return { tag: 'data', val: value };
      }
      return { tag: this.eof ? 'end' : 'pending' };
    };
    return {
      read: async (maximum) => {
        for (;;) {
          const result = take(maximum);
          if (result.tag === 'data') return result.val;
          if (result.tag === 'end') return undefined;
          await fetch();
        }
      },
      tryRead: async (maximum) => {
        const result = take(maximum);
        if (result.tag === 'pending') void fetch();
        return result;
      },
      ready: () => !!this.chunk || this.eof,
      waitReady: fetch,
      cancel: () => (this.eof ? Promise.resolve() : this.fail(cancelled)),
      [Symbol.asyncDispose]: () => (this.eof ? Promise.resolve() : this.fail(cancelled)),
    };
  }
  [Symbol.asyncDispose]() {
    return this.fail(cancelled);
  }
}
