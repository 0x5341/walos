#include "http_middleware.h"
#include <string.h>
#include <stdlib.h>

static http_middleware_waitable_status_t completed(uint32_t handle, http_middleware_waitable_status_t status) {
  if (status != HTTP_MIDDLEWARE_WAITABLE_STATUS_BLOCKED) return status;
  http_middleware_waitable_set_t set = http_middleware_waitable_set_new();
  http_middleware_waitable_join(handle, set);
  http_middleware_event_t event;
  http_middleware_waitable_set_wait(set, &event);
  http_middleware_waitable_join(handle, 0); http_middleware_waitable_set_drop(set);
  return event.code;
}

http_middleware_callback_code_t exports_wasi_http_handler_handle(exports_wasi_http_handler_own_request_t request) {
  http_middleware_string_t path = {0};
  wasi_http_types_method_request_get_path_with_query(wasi_http_types_borrow_request(request), &path);
  if (path.len == 6 && !memcmp(path.ptr, "/short", 6)) {
    http_middleware_string_free(&path);
    wasi_http_types_request_drop_own(request);
    wasi_http_types_future_result_option_own_trailers_error_code_writer_t writer;
    wasi_http_types_future_result_option_own_trailers_error_code_t trailers = wasi_http_types_future_result_option_own_trailers_error_code_new(&writer);
    wasi_http_types_result_option_own_trailers_error_code_t empty = {0};
    completed(writer, wasi_http_types_future_result_option_own_trailers_error_code_write(writer, &empty));
    wasi_http_types_future_result_option_own_trailers_error_code_drop_writable(writer);
    wasi_http_types_tuple2_own_response_future_result_void_error_code_t response;
    wasi_http_types_static_response_new(wasi_http_types_constructor_fields(), NULL, trailers, &response);
    wasi_http_types_method_response_set_status_code(wasi_http_types_borrow_response(response.f0), 403);
    exports_wasi_http_handler_result_own_response_error_code_t result = {.is_err = false}; result.val.ok = response.f0;
    exports_wasi_http_handler_handle_return(result);
    wasi_http_types_result_void_error_code_t handled;
    completed(response.f1, wasi_http_types_future_result_void_error_code_read(response.f1, &handled));
    wasi_http_types_future_result_void_error_code_drop_readable(response.f1);
    return HTTP_MIDDLEWARE_CALLBACK_CODE_EXIT;
  }
  uint8_t *buffer = malloc(path.len + 4);
  memcpy(buffer, "/via", 4); memcpy(buffer + 4, path.ptr, path.len);
  http_middleware_string_t modified = {buffer, path.len + 4};
  wasi_http_types_method_request_set_path_with_query(wasi_http_types_borrow_request(request), &modified);
  free(buffer); http_middleware_string_free(&path);
  wasi_http_handler_result_own_response_error_code_t result;
  http_middleware_subtask_status_t status = wasi_http_handler_handle(request, &result);
  http_middleware_subtask_t task = HTTP_MIDDLEWARE_SUBTASK_HANDLE(status);
  if (HTTP_MIDDLEWARE_SUBTASK_STATE(status) != HTTP_MIDDLEWARE_SUBTASK_RETURNED) {
    http_middleware_waitable_set_t set = http_middleware_waitable_set_new();
    http_middleware_waitable_join(task, set);
    http_middleware_event_t event;
    do { http_middleware_waitable_set_wait(set, &event); } while (event.code != HTTP_MIDDLEWARE_SUBTASK_RETURNED);
    http_middleware_waitable_join(task, 0); http_middleware_waitable_set_drop(set);
  }
  if (task) http_middleware_subtask_drop(task);
  if (!result.is_err) wasi_http_types_method_response_set_status_code(wasi_http_types_borrow_response(result.val.ok), 201);
  exports_wasi_http_handler_result_own_response_error_code_t response = {.is_err = result.is_err};
  if (result.is_err) response.val.err = result.val.err; else response.val.ok = result.val.ok;
  exports_wasi_http_handler_handle_return(response);
  return HTTP_MIDDLEWARE_CALLBACK_CODE_EXIT;
}
http_middleware_callback_code_t exports_wasi_http_handler_handle_callback(http_middleware_event_t *event) {
  (void)event;
  return HTTP_MIDDLEWARE_CALLBACK_CODE_EXIT;
}
