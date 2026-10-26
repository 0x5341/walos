/* Real P2 parent using generated public WIT bindings. */
#include "lifecycle_probe.h"
#include <string.h>

static lifecycle_probe_string_t text(char *value) {
  return (lifecycle_probe_string_t){(uint8_t *)value, strlen(value)};
}
bool exports_wasi_cli_run_run(void) {
  lifecycle_probe_list_string_t args;
  wasi_cli_environment_get_arguments(&args);
  if (args.len != 3)
    __builtin_trap();
  wasi_filesystem_preopens_list_tuple2_own_descriptor_string_t dirs;
  wasi_filesystem_preopens_get_directories(&dirs);
  if (!dirs.len)
    __builtin_trap();
  wasi_filesystem_types_borrow_descriptor_t root =
      wasi_filesystem_types_borrow_descriptor(dirs.ptr[0].f0);
  char path[128] = "bin/";
  if (args.ptr[1].len > 100)
    __builtin_trap();
  memcpy(path + 4, args.ptr[1].ptr, args.ptr[1].len);
  path[4 + args.ptr[1].len] = 0;
  lifecycle_probe_string_t name = text(path);
  wasi_filesystem_types_own_descriptor_t executable;
  wasi_filesystem_types_error_code_t fs_error;
  if (!wasi_filesystem_types_method_descriptor_open_at(
          root, 0, &name, 0, WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ,
          &executable, &fs_error))
    __builtin_trap();
  lifecycle_probe_list_string_t child_args = {&args.ptr[1], 1};
  walos_runtime_process_environment_entry_t pwd = {text("PWD"),text("/")};
  walos_runtime_process_list_environment_entry_t env = {&pwd,1};
  walos_runtime_process_own_child_process_t child;
  walos_runtime_process_spawn_error_t error;
  bool spawned = walos_runtime_process_spawn(
      wasi_filesystem_types_borrow_descriptor(executable), &child_args,
      &env, NULL, NULL, NULL, &child, &error);
  char *message = spawned ? "audit-parent-ready\n" : "audit-parent-failed\n";
  lifecycle_probe_list_u8_t bytes = {(uint8_t *)message, strlen(message)};
  wasi_cli_stdout_own_output_stream_t stdout_stream = wasi_cli_stdout_get_stdout();
  wasi_io_streams_stream_error_t stream_error;
  if (!wasi_io_streams_method_output_stream_blocking_write_and_flush(
          wasi_io_streams_borrow_output_stream(stdout_stream), &bytes, &stream_error))
    __builtin_trap();
  wasi_io_streams_output_stream_drop_own(stdout_stream);
  if (args.ptr[2].len == 4 && !memcmp(args.ptr[2].ptr, "trap", 4))
    __builtin_trap();
  return !(args.ptr[2].len == 7 && !memcmp(args.ptr[2].ptr, "nonzero", 7));
}
