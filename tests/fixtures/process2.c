/* Generated bindings exercise the actual public WIT across a P2 parent,
 * a P2 producer and a P1 consumer. No private Core imports are used. */
#include "process_probe.h"
#include <string.h>
#define CHECK(condition)                                                       \
  do {                                                                         \
    if (!(condition))                                                          \
      return false;                                                            \
  } while (0)
static process_probe_string_t text(char *value) {
  return (process_probe_string_t){(uint8_t *)value, strlen(value)};
}
static bool open_file(wasi_filesystem_types_borrow_descriptor_t root,
                      char *path, wasi_filesystem_types_own_descriptor_t *out) {
  process_probe_string_t name = text(path);
  wasi_filesystem_types_error_code_t error;
  return wasi_filesystem_types_method_descriptor_open_at(
      root, 0, &name, 0, WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ, out,
      &error);
}
bool exports_wasi_cli_run_run(void) {
  // Each standard getter returns an independently owned resource.
  wasi_cli_stdout_own_output_stream_t first = wasi_cli_stdout_get_stdout();
  wasi_cli_stdout_own_output_stream_t second = wasi_cli_stdout_get_stdout();
  wasi_io_streams_output_stream_drop_own(first);
  process_probe_list_u8_t message = {
      (uint8_t *)"component-resource-lifetimes\n", 29};
  wasi_io_streams_stream_error_t stream_error;
  CHECK(wasi_io_streams_method_output_stream_blocking_write_and_flush(
      wasi_io_streams_borrow_output_stream(second), &message, &stream_error));
  wasi_io_streams_output_stream_drop_own(second);
  wasi_filesystem_preopens_list_tuple2_own_descriptor_string_t dirs;
  wasi_filesystem_preopens_get_directories(&dirs);
  CHECK(dirs.len > 0);
  wasi_filesystem_types_borrow_descriptor_t root =
      wasi_filesystem_types_borrow_descriptor(dirs.ptr[0].f0);
  wasi_filesystem_types_own_descriptor_t producer, consumer;
  CHECK(open_file(root, "bin/p2-echo", &producer));
  CHECK(open_file(root, "bin/cat", &consumer));
  walos_runtime_ipc_tuple2_own_input_stream_own_output_stream_t pipe;
  walos_runtime_ipc_create_pipe(&pipe);
  process_probe_string_t args[] = {text("p2-echo"),
                                   text("component-spawn-pipe")};
  process_probe_list_string_t argv = {args, 2};
  walos_runtime_process_list_environment_entry_t env = {0};
  walos_runtime_process_spawn_error_t error;
  walos_runtime_process_own_child_process_t a, b;
  CHECK(walos_runtime_process_spawn(
      wasi_filesystem_types_borrow_descriptor(producer), root, &argv, &env,
      NULL, &pipe.f1, NULL, &a, &error));
  args[0] = text("cat");
  argv.len = 1;
  CHECK(walos_runtime_process_spawn(
      wasi_filesystem_types_borrow_descriptor(consumer), root, &argv, &env,
      &pipe.f0, NULL, NULL, &b, &error));
  walos_runtime_process_borrow_child_process_t ah =
      walos_runtime_process_borrow_child_process(a);
  walos_runtime_process_borrow_child_process_t bh =
      walos_runtime_process_borrow_child_process(b);
  CHECK(walos_runtime_process_method_child_process_pid(ah) !=
        walos_runtime_process_method_child_process_pid(bh));
  walos_runtime_process_exit_result_t exit;
  walos_runtime_process_wait_error_t wait_error;
  CHECK(
      walos_runtime_process_method_child_process_wait(ah, &exit, &wait_error));
  CHECK(exit.tag == WALOS_RUNTIME_PROCESS_EXIT_RESULT_EXITED &&
        exit.val.exited == 0);
  CHECK(
      walos_runtime_process_method_child_process_wait(bh, &exit, &wait_error));
  CHECK(exit.tag == WALOS_RUNTIME_PROCESS_EXIT_RESULT_EXITED &&
        exit.val.exited == 0);
  CHECK(
      !walos_runtime_process_method_child_process_wait(ah, &exit, &wait_error));
  CHECK(wait_error.tag == WALOS_RUNTIME_PROCESS_WAIT_ERROR_ALREADY_CONSUMED);
  walos_runtime_process_child_process_drop_own(a);
  walos_runtime_process_child_process_drop_own(b);
  // Spawn consumes explicit streams even when the executable is a directory.
  walos_runtime_ipc_create_pipe(&pipe);
  CHECK(!walos_runtime_process_spawn(root, root, &argv, &env, NULL, &pipe.f1,
                                     NULL, &a, &error));
  CHECK(error.tag == WALOS_RUNTIME_PROCESS_SPAWN_ERROR_INVALID_DESCRIPTOR);
  wasi_io_streams_input_stream_drop_own(pipe.f0);
  // A file stream moves its handle and logical offset; the parent releases its
  // lock.
  wasi_filesystem_types_own_descriptor_t output_file;
  wasi_filesystem_types_error_code_t fs_error;
  process_probe_string_t output_path = text("tmp/p2-owned");
  CHECK(wasi_filesystem_types_method_descriptor_open_at(
      root, 0, &output_path,
      WASI_FILESYSTEM_TYPES_OPEN_FLAGS_CREATE |
          WASI_FILESYSTEM_TYPES_OPEN_FLAGS_TRUNCATE,
      WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ |
          WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_WRITE,
      &output_file, &fs_error));
  wasi_io_streams_own_output_stream_t file_output;
  CHECK(wasi_filesystem_types_method_descriptor_write_via_stream(
      wasi_filesystem_types_borrow_descriptor(output_file), 0, &file_output,
      &fs_error));
  args[0] = text("p2-echo");
  args[1] = text("component-file-transfer");
  argv.len = 2;
  CHECK(walos_runtime_process_spawn(
      wasi_filesystem_types_borrow_descriptor(producer), root, &argv, &env,
      NULL, &file_output, NULL, &a, &error));
  ah = walos_runtime_process_borrow_child_process(a);
  CHECK(
      walos_runtime_process_method_child_process_wait(ah, &exit, &wait_error));
  CHECK(exit.tag == WALOS_RUNTIME_PROCESS_EXIT_RESULT_EXITED &&
        exit.val.exited == 0);
  walos_runtime_process_child_process_drop_own(a);
  process_probe_tuple2_list_u8_bool_t file_result;
  CHECK(wasi_filesystem_types_method_descriptor_read(
      wasi_filesystem_types_borrow_descriptor(output_file), 100, 0,
      &file_result, &fs_error));
  CHECK(file_result.f1 && file_result.f0.len == 24 &&
        !memcmp(file_result.f0.ptr, "component-file-transfer\n", 24));
  process_probe_list_u8_free(&file_result.f0);
  wasi_filesystem_types_descriptor_drop_own(output_file);
  // The WIT request-stop method reaches the same supervisor escalation as the
  // UI.
  wasi_filesystem_types_own_descriptor_t hang;
  CHECK(open_file(root, "bin/p2-hang", &hang));
  args[0] = text("p2-hang");
  argv.len = 1;
  CHECK(walos_runtime_process_spawn(
      wasi_filesystem_types_borrow_descriptor(hang), root, &argv, &env, NULL,
      NULL, NULL, &a, &error));
  ah = walos_runtime_process_borrow_child_process(a);
  walos_runtime_process_method_child_process_request_stop(ah);
  CHECK(
      walos_runtime_process_method_child_process_wait(ah, &exit, &wait_error));
  CHECK(exit.tag == WALOS_RUNTIME_PROCESS_EXIT_RESULT_TERMINATED);
  walos_runtime_process_exit_result_free(&exit);
  walos_runtime_process_child_process_drop_own(a);
  wasi_filesystem_types_descriptor_drop_own(hang);
  wasi_filesystem_types_descriptor_drop_own(producer);
  wasi_filesystem_types_descriptor_drop_own(consumer);
  wasi_filesystem_preopens_list_tuple2_own_descriptor_string_free(&dirs);
  return true;
}
