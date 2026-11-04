/* Native P3 service: return response before pumping the request body, preserving
 * trailers and reporting handling independently of stream EOF. */
#include "http_service.h"
#include <string.h>

static http_service_waitable_status_t completed(uint32_t handle, http_service_waitable_status_t status) {
  if (status != HTTP_SERVICE_WAITABLE_STATUS_BLOCKED) return status;
  http_service_waitable_set_t set = http_service_waitable_set_new();
  http_service_waitable_join(handle, set);
  http_service_event_t event;
  http_service_waitable_set_wait(set, &event);
  http_service_waitable_join(handle, 0);
  http_service_waitable_set_drop(set);
  return event.code;
}
static http_service_string_t text(char *s) { return (http_service_string_t){(uint8_t *)s, strlen(s)}; }
static unsigned calls;
static void subtask(http_service_subtask_status_t status) {
  http_service_subtask_t task = HTTP_SERVICE_SUBTASK_HANDLE(status);
  if (HTTP_SERVICE_SUBTASK_STATE(status) != HTTP_SERVICE_SUBTASK_RETURNED) {
    http_service_waitable_set_t set = http_service_waitable_set_new();
    http_service_waitable_join(task, set);
    http_service_event_t event;
    do { http_service_waitable_set_wait(set, &event); } while (event.code != HTTP_SERVICE_SUBTASK_RETURNED);
    http_service_waitable_join(task, 0); http_service_waitable_set_drop(set);
  }
  if (task) http_service_subtask_drop(task);
}
http_service_callback_code_t exports_wasi_http_handler_handle(exports_wasi_http_handler_own_request_t request) {
  http_service_string_t path = {0};
  wasi_http_types_method_request_get_path_with_query(wasi_http_types_borrow_request(request), &path);
  bool trap = path.len >= 5 && !memcmp(path.ptr, "/trap", 5);
  bool hang = (path.len >= 5 && !memcmp(path.ptr, "/hang", 5)) || (path.len >= 8 && !memcmp(path.ptr, "/pending", 8));
  bool spin = path.len >= 5 && !memcmp(path.ptr, "/spin", 5);
  bool trailer_error = path.len >= 14 && !memcmp(path.ptr, "/trailer-error", 14);
  bool error = path.len >= 6 && !memcmp(path.ptr, "/error", 6);
  if (path.len == 8 && !memcmp(path.ptr, "/recurse", 8)) {
    http_service_string_free(&path);
    wasi_http_client_result_own_response_error_code_t downstream;
    subtask(wasi_http_client_send(request, &downstream));
    exports_wasi_http_handler_result_own_response_error_code_t result = {.is_err = downstream.is_err};
    if (downstream.is_err) result.val.err = downstream.val.err; else result.val.ok = downstream.val.ok;
    exports_wasi_http_handler_handle_return(result);
    return HTTP_SERVICE_CALLBACK_CODE_EXIT;
  }
  if (trap) __builtin_trap();
  if (spin) for (;;) __asm__ volatile("");
  if (hang) {
    http_service_waitable_set_t set = http_service_waitable_set_new();
    http_service_event_t event;
    http_service_waitable_set_wait(set, &event);
    __builtin_trap();
  }
  if (error) {
    wasi_http_types_request_drop_own(request);
    http_service_string_free(&path);
    exports_wasi_http_handler_result_own_response_error_code_t result = {.is_err = true};
    result.val.err.tag = WASI_HTTP_TYPES_ERROR_CODE_CONFIGURATION_ERROR;
    exports_wasi_http_handler_handle_return(result);
    return HTTP_SERVICE_CALLBACK_CODE_EXIT;
  }
  wasi_http_types_own_fields_t incoming = wasi_http_types_method_request_get_headers(wasi_http_types_borrow_request(request));
  wasi_http_types_own_fields_t headers = wasi_http_types_method_fields_clone(wasi_http_types_borrow_fields(incoming));
  wasi_http_types_fields_drop_own(incoming);
  wasi_http_types_header_error_t err;
  http_service_string_t name = text("X-Path");
  wasi_http_types_field_value_t field = {path.ptr, path.len};
  wasi_http_types_method_fields_append(wasi_http_types_borrow_fields(headers), &name, &field, &err);
  http_service_string_free(&path);
  char counter[16]; unsigned count = ++calls, digits = 0;
  do { counter[digits++] = '0' + count % 10; count /= 10; } while (count);
  for (unsigned i = 0; i < digits / 2; i++) { char c = counter[i]; counter[i] = counter[digits-i-1]; counter[digits-i-1] = c; }
  name = text("X-Calls"); field = (wasi_http_types_field_value_t){(uint8_t *)counter, digits};
  wasi_http_types_method_fields_append(wasi_http_types_borrow_fields(headers), &name, &field, &err);

  wasi_http_types_future_result_void_error_code_writer_t handled_writer;
  wasi_http_types_future_result_void_error_code_t handled = wasi_http_types_future_result_void_error_code_new(&handled_writer);
  wasi_http_types_tuple2_stream_u8_future_result_option_own_trailers_error_code_t body;
  wasi_http_types_static_request_consume_body(request, handled, &body);
  wasi_http_types_stream_u8_writer_t writer;
  wasi_http_types_stream_u8_t stream = wasi_http_types_stream_u8_new(&writer);
  wasi_http_types_future_result_option_own_trailers_error_code_writer_t trailer_writer;
  wasi_http_types_future_result_option_own_trailers_error_code_t trailers = wasi_http_types_future_result_option_own_trailers_error_code_new(&trailer_writer);
  wasi_http_types_tuple2_own_response_future_result_void_error_code_t response;
  wasi_http_types_static_response_new(headers, &stream, trailers, &response);
  exports_wasi_http_handler_result_own_response_error_code_t result = {.is_err = false};
  result.val.ok = response.f0;
  exports_wasi_http_handler_handle_return(result);

  uint8_t bytes[4096];
  for (;;) {
    http_service_waitable_status_t status = completed(body.f0, wasi_http_types_stream_u8_read(body.f0, bytes, sizeof(bytes)));
    if (HTTP_SERVICE_WAITABLE_STATE(status) == HTTP_SERVICE_WAITABLE_DROPPED) break;
    if (HTTP_SERVICE_WAITABLE_STATE(status) != HTTP_SERVICE_WAITABLE_COMPLETED) __builtin_trap();
    size_t size = HTTP_SERVICE_WAITABLE_COUNT(status), offset = 0;
    while (offset < size) {
      status = completed(writer, wasi_http_types_stream_u8_write(writer, bytes + offset, size - offset));
      if (HTTP_SERVICE_WAITABLE_STATE(status) != HTTP_SERVICE_WAITABLE_COMPLETED) __builtin_trap();
      offset += HTTP_SERVICE_WAITABLE_COUNT(status);
    }
  }
  wasi_http_types_stream_u8_drop_readable(body.f0);
  wasi_http_types_stream_u8_drop_writable(writer);
  wasi_http_types_result_option_own_trailers_error_code_t ending;
  completed(body.f1, wasi_http_types_future_result_option_own_trailers_error_code_read(body.f1, &ending));
  wasi_http_types_future_result_option_own_trailers_error_code_drop_readable(body.f1);
  wasi_http_types_result_void_error_code_t success = {.is_err = false};
  completed(handled_writer, wasi_http_types_future_result_void_error_code_write(handled_writer, &success));
  wasi_http_types_future_result_void_error_code_drop_writable(handled_writer);
  if (trailer_error) { ending.is_err = true; ending.val.err.tag = WASI_HTTP_TYPES_ERROR_CODE_HTTP_RESPONSE_INCOMPLETE; }
  completed(trailer_writer, wasi_http_types_future_result_option_own_trailers_error_code_write(trailer_writer, &ending));
  wasi_http_types_future_result_option_own_trailers_error_code_drop_writable(trailer_writer);
  completed(response.f1, wasi_http_types_future_result_void_error_code_read(response.f1, &success));
  wasi_http_types_future_result_void_error_code_drop_readable(response.f1);
  return HTTP_SERVICE_CALLBACK_CODE_EXIT;
}
http_service_callback_code_t exports_wasi_http_handler_handle_callback(http_service_event_t *event) {
  (void)event;
  return HTTP_SERVICE_CALLBACK_CODE_EXIT;
}
