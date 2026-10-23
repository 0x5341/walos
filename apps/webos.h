#ifndef WEBOS_H
#define WEBOS_H
#include <stdint.h>
#define OS_IMPORT(name)                                                        \
  __attribute__((import_module("webos_v1"), import_name(name)))
OS_IMPORT("spawn")
int os_spawn(int exe, int cwd, const char *json, int length, int in, int out,
             int err, uint32_t *handle);
OS_IMPORT("wait") int os_wait(uint32_t handle, uint32_t result[2]);
OS_IMPORT("pid") int os_pid(uint32_t handle);
OS_IMPORT("drop") int os_drop(uint32_t handle);
OS_IMPORT("request_stop") int os_stop(uint32_t handle);
OS_IMPORT("create_pipe") int os_pipe(int fds[2]);
OS_IMPORT("foreground")
int os_foreground(uint32_t *handles, int length, int input_handle);
#endif
