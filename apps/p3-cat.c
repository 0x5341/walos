/* Native WASI 0.3.2 cat. Use generated imports rather than the SDK's older libc ABI. */
#include "command.h"
#include <stdlib.h>
#include <string.h>

static command_waitable_status_t completed(uint32_t handle, command_waitable_status_t status) {
  if (status != COMMAND_WAITABLE_STATUS_BLOCKED) return status;
  command_waitable_set_t set = command_waitable_set_new();
  command_waitable_join(handle, set);
  command_event_t event;
  command_waitable_set_wait(set, &event);
  command_waitable_join(handle, 0);
  command_waitable_set_drop(set);
  return event.code;
}

static void subtask(command_subtask_status_t status) {
  command_subtask_t handle = COMMAND_SUBTASK_HANDLE(status);
  if (COMMAND_SUBTASK_STATE(status) != COMMAND_SUBTASK_RETURNED) {
    command_waitable_set_t set = command_waitable_set_new();
    command_waitable_join(handle, set);
    command_event_t event;
    do { command_waitable_set_wait(set, &event); }
    while (event.code != COMMAND_SUBTASK_RETURNED);
    command_waitable_join(handle, 0);
    command_waitable_set_drop(set);
  }
  if (handle) command_subtask_drop(handle);
}

static bool write_bytes(bool error, const uint8_t *bytes, size_t size) {
  wasi_cli_stdin_stream_u8_writer_t writer;
  wasi_cli_stdin_stream_u8_t reader = wasi_cli_stdin_stream_u8_new(&writer);
  uint32_t future = error ? wasi_cli_stderr_write_via_stream(reader) : wasi_cli_stdout_write_via_stream(reader);
  size_t offset = 0;
  bool success = true;
  while (offset < size) {
    command_waitable_status_t status = completed(writer,
      wasi_cli_stdin_stream_u8_write(writer, bytes + offset, size - offset));
    size_t count = COMMAND_WAITABLE_COUNT(status);
    if (COMMAND_WAITABLE_STATE(status) != COMMAND_WAITABLE_COMPLETED || !count) {
      success = false;
      break;
    }
    offset += count;
  }
  wasi_cli_stdin_stream_u8_drop_writable(writer);
  command_waitable_status_t status;
  if (error) {
    wasi_cli_stderr_result_void_error_code_t result;
    status = completed(future, wasi_cli_stderr_future_result_void_error_code_read(future, &result));
    wasi_cli_stderr_future_result_void_error_code_drop_readable(future);
    success = success && COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED && !result.is_err;
  } else {
    wasi_cli_stdout_result_void_error_code_t result;
    status = completed(future, wasi_cli_stdout_future_result_void_error_code_read(future, &result));
    wasi_cli_stdout_future_result_void_error_code_drop_readable(future);
    success = success && COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED && !result.is_err;
  }
  return success && COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED;
}

static void error_message(command_string_t path, const char *message) {
  const char *prefix = "p3-cat: ";
  write_bytes(true, (const uint8_t *)prefix, strlen(prefix));
  write_bytes(true, path.ptr, path.len);
  write_bytes(true, (const uint8_t *)message, strlen(message));
}

static bool copy_stream(uint32_t reader, bool file) {
  uint8_t buffer[4096];
  for (;;) {
    command_waitable_status_t status = completed(reader, file
      ? wasi_filesystem_types_stream_u8_read(reader, buffer, sizeof(buffer))
      : wasi_cli_stdin_stream_u8_read(reader, buffer, sizeof(buffer)));
    if (COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_DROPPED) return true;
    if (COMMAND_WAITABLE_STATE(status) != COMMAND_WAITABLE_COMPLETED) return false;
    if (!write_bytes(false, buffer, COMMAND_WAITABLE_COUNT(status))) return false;
  }
}

static bool copy_stdin(void) {
  wasi_cli_stdin_tuple2_stream_u8_future_result_void_error_code_t input;
  wasi_cli_stdin_read_via_stream(&input);
  bool success = copy_stream(input.f0, false);
  wasi_cli_stdin_stream_u8_drop_readable(input.f0);
  wasi_cli_stdin_result_void_error_code_t result;
  command_waitable_status_t status = completed(input.f1,
    wasi_cli_stdin_future_result_void_error_code_read(input.f1, &result));
  wasi_cli_stdin_future_result_void_error_code_drop_readable(input.f1);
  return success && COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED && !result.is_err;
}

static bool equals(command_string_t value, const char *text) {
  return value.len == strlen(text) && !memcmp(value.ptr, text, value.len);
}

typedef struct {
  bool loaded;
  wasi_filesystem_preopens_list_tuple2_own_descriptor_string_t dirs;
} files_t;

static bool copy_file(files_t *files, command_string_t operand) {
  if (!files->loaded) {
    wasi_filesystem_preopens_get_directories(&files->dirs);
    files->loaded = true;
  }
  size_t root = 0;
  while (root < files->dirs.len && !equals(files->dirs.ptr[root].f1, "/")) root++;
  if (root == files->dirs.len || !operand.len) {
    error_message(operand, ": cannot open file\n");
    return false;
  }
  wasi_filesystem_types_borrow_descriptor_t dir = wasi_filesystem_types_borrow_descriptor(files->dirs.ptr[root].f0);
  command_string_t path = operand, cwd = {0};
  uint8_t *relative = NULL;
  if (operand.ptr[0] == '/') {
    while (path.len && path.ptr[0] == '/') { path.ptr++; path.len--; }
  } else {
    // Resolve a relative operand from the explicit PWD snapshot, only when needed.
    // The directory descriptor API itself intentionally accepts relative paths only.
    if (wasi_cli_environment_get_initial_cwd(&cwd)) {
      if (!cwd.len || cwd.ptr[0] != '/') {
        command_string_free(&cwd);
        error_message(operand, ": invalid current directory\n");
        return false;
      }
      wasi_filesystem_types_method_descriptor_open_at_args_t check = {
        .self = dir, .path = {cwd.ptr + 1, cwd.len - 1},
        .open_flags = WASI_FILESYSTEM_TYPES_OPEN_FLAGS_DIRECTORY,
        .flags = WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ
      };
      wasi_filesystem_types_result_own_descriptor_error_code_t result;
      subtask(wasi_filesystem_types_method_descriptor_open_at(&check, &result));
      if (result.is_err) {
        command_string_free(&cwd);
        error_message(operand, ": cannot open current directory\n");
        return false;
      }
      wasi_filesystem_types_descriptor_drop_own(result.val.ok);
      relative = malloc(cwd.len + operand.len);
      if (!relative) {
        command_string_free(&cwd);
        error_message(operand, ": out of memory\n");
        return false;
      }
      memcpy(relative, cwd.ptr + 1, cwd.len - 1);
      relative[cwd.len - 1] = '/';
      memcpy(relative + cwd.len, operand.ptr, operand.len);
      path = (command_string_t){relative, cwd.len + operand.len};
      // Root-relative open-at paths must not start with '/'.
      if (path.ptr[0] == '/') { path.ptr++; path.len--; }
      command_string_free(&cwd);
    }
  }
  wasi_filesystem_types_method_descriptor_open_at_args_t args = {
    .self = dir, .path = path, .flags = WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ
  };
  wasi_filesystem_types_result_own_descriptor_error_code_t opened;
  subtask(wasi_filesystem_types_method_descriptor_open_at(&args, &opened));
  free(relative);
  if (opened.is_err) {
    error_message(operand, ": cannot open file\n");
    return false;
  }
  wasi_filesystem_types_tuple2_stream_u8_future_result_void_error_code_t input;
  wasi_filesystem_types_method_descriptor_read_via_stream(
    wasi_filesystem_types_borrow_descriptor(opened.val.ok), 0, &input);
  wasi_filesystem_types_descriptor_drop_own(opened.val.ok);
  bool success = copy_stream(input.f0, true);
  wasi_filesystem_types_stream_u8_drop_readable(input.f0);
  wasi_filesystem_types_result_void_error_code_t result;
  command_waitable_status_t status = completed(input.f1,
    wasi_filesystem_types_future_result_void_error_code_read(input.f1, &result));
  wasi_filesystem_types_future_result_void_error_code_drop_readable(input.f1);
  success = success && COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED && !result.is_err;
  if (!success) error_message(operand, ": read or write failed\n");
  return success;
}

command_callback_code_t exports_wasi_cli_run_run(void) {
  command_list_string_t args;
  wasi_cli_environment_get_arguments(&args);
  files_t files = {0};
  bool success = true, operands = false, options = true;
  for (size_t i = 1; i < args.len; i++) {
    command_string_t operand = args.ptr[i];
    if (options && equals(operand, "--")) { options = false; continue; }
    if (options && equals(operand, "-u")) continue;
    if (options && operand.len > 1 && operand.ptr[0] == '-') {
      error_message(operand, ": usage: p3-cat [-u] [file ...]\n");
      success = false;
      operands = true;
      break;
    }
    options = false;
    operands = true;
    if (equals(operand, "-")) {
      if (!copy_stdin()) { error_message(operand, ": read or write failed\n"); success = false; }
    } else if (!copy_file(&files, operand)) success = false;
  }
  if (!operands && !copy_stdin()) {
    error_message((command_string_t){(uint8_t *)"<stdin>", 7}, ": read or write failed\n");
    success = false;
  }
  if (files.loaded) wasi_filesystem_preopens_list_tuple2_own_descriptor_string_free(&files.dirs);
  command_list_string_free(&args);
  exports_wasi_cli_run_run_return((exports_wasi_cli_run_result_void_void_t){.is_err = !success});
  return COMMAND_CALLBACK_CODE_EXIT;
}

command_callback_code_t exports_wasi_cli_run_run_callback(command_event_t *event) {
  (void)event;
  __builtin_trap();
}
