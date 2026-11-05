import { Future, type Stream } from '../async.js';
import { ServiceError } from '../types.js';
import type { Result, WasiHttpTypes as HTTP } from '../wasi-types.js';
import { HttpFields } from './http-fields.js';
import { HttpRequestOptions } from './http-options.js';
import { HttpBody } from './http-body.js';
import { HttpRequest, HttpResponse } from './http-resources.js';

type Scope = { add<T extends AsyncDisposable>(value: T): T };
export function createHttpTypes(scope: Scope, networkTimeouts = false): HTTP.Interface {
  const fields = (value: HTTP.Fields) => {
    if (!(value instanceof HttpFields))
      throw new ServiceError('invalid-resource', 'Foreign HTTP fields');
    return scope.add(value.move());
  };
  const body = (
    contents: Stream<number> | undefined,
    trailers: Future<Result<HTTP.Fields | undefined, HTTP.ErrorCode>>,
  ) => scope.add(new HttpBody(contents, trailers));
  return {
    fields: {
      new: () => scope.add(new HttpFields()),
      fromList: (entries) => {
        const result = HttpFields.fromList(entries);
        if (result.tag === 'ok') scope.add(result.val);
        return result;
      },
    },
    requestOptions: {
      new: () =>
        scope.add(
          new HttpRequestOptions(undefined, false, () => {}, networkTimeouts ? {} : undefined),
        ),
    },
    request: {
      new: (headers, contents, trailers, options) => {
        if (options && !(options instanceof HttpRequestOptions))
          throw new ServiceError('invalid-resource', 'Foreign HTTP options');
        const movedOptions = options?.move();
        const state = body(contents, trailers);
        return [scope.add(new HttpRequest(fields(headers), state, movedOptions)), state.completion];
      },
      consumeBody: (request, result) => {
        if (!(request instanceof HttpRequest))
          throw new ServiceError('invalid-resource', 'Foreign HTTP request');
        const state = request.consume();
        return [state.consume(result), state.trailers];
      },
    },
    response: {
      new: (headers, contents, trailers) => {
        const state = body(contents, trailers);
        return [scope.add(new HttpResponse(fields(headers), state)), state.completion];
      },
      consumeBody: (response, result) => {
        if (!(response instanceof HttpResponse))
          throw new ServiceError('invalid-resource', 'Foreign HTTP response');
        response.move();
        return [response.body.consume(result), response.body.trailers];
      },
    },
  };
}
