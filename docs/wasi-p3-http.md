# WASI 0.3.2 HTTP

The common Context implements `wasi:http/types` resources and `client.send` for
Host callers and native async P3 CLI components. `handler.handle` remains an
unimplemented trap. No P2 HTTP adapter or server is provided.

Fields retain original casing, order, duplicate values and raw bytes locally.
Comparison is case insensitive and clones are mutable deep copies. Message
constructors take ownership of headers, options, content streams and trailer
futures. Message header views and request option views are immutable. Options
views must be dropped before dropping or sending their parent request;
`consume-body` preserves previously obtained views. Consuming or sending a
message invalidates its old handle.

## Browser transport

HTTP and HTTPS use Fetch in the calling process, with CORS mode, same-origin
credentials and redirects rejected. Missing scheme defaults to HTTPS; authority
is required, and missing path defaults to `/`. Userinfo is rejected. Browser
CSP, mixed content, network policy and CORS remain in effect. This is not a
capability isolation boundary.

Uploads use ReadableStream and `duplex: half`, without whole-body buffering or a
buffered fallback. Browser support and an HTTP/2 or HTTP/3 connection are required
for streaming uploads in Chromium. Responses become available after the upload
finishes. GET/HEAD bodies and browser-forbidden methods/headers are rejected,
not silently discarded. Fetch may normalize and combine transmitted headers;
received headers include only what the browser exposes. Browser decompression
means the returned body is not necessarily the encoded wire bytes.

Local message bodies support trailer fields. Network uploads support no trailers
or empty trailers only; nonempty trailers fail with `configuration-error` and
abort the transfer. Fetch does not expose received trailers: the trailer future
returns `ok(none)` after EOF, which does not prove the server sent no trailers.

Connect and first-byte timeout setters accept `none`, but return
`not-supported` for concrete durations. Between-bytes timeout bounds each pending
network read and returns `connection-read-timeout`. Time spent not requesting
another body chunk is not counted. Durations are nanoseconds; browser timer
resolution applies. Immutable options return `immutable` for setters.

HTTP error statuses (including 4xx/5xx) are successful responses. Locally detected
URI, method and header failures use the corresponding WASI errors. Body read
failures use `HTTP-response-incomplete`. Fetch hides CORS, DNS and TLS error
causes; those failures use `internal-error` rather than guessing a cause.
Cancellation also uses `internal-error`, since HTTP defines no cancellation
variant. Debug strings are diagnostic, not stable error identifiers.

Dropping a body or cancelling send aborts the transport, cancels input streams
and settles pending body futures. Process/OS disposal performs the same cleanup.
EOF and the trailer result describe body reception; the separate handling result
future communicates the consumer's outcome to the producer.
