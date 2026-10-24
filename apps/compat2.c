/* wasi-sdk 27's libc still initializes cwd to /. Use the standard Preview 2
 * initial-cwd interface before main, just as the P1 bridge initializes libc. */
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <wasi/wasip2.h>
__attribute__((constructor)) static void initialize_cwd(void) {
  wasip2_string_t cwd;
  if (!environment_initial_cwd(&cwd))
    return;
  char *path = malloc(cwd.len + 1);
  if (!path)
    _Exit(126);
  memcpy(path, cwd.ptr, cwd.len);
  path[cwd.len] = 0;
  wasip2_string_free(&cwd);
  if (chdir(path)) {
    perror(path);
    _Exit(126);
  }
  free(path);
}
