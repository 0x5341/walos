/* Preview 1 has no initial-cwd API. Initialize wasi-libc's local cwd from the
 * directory descriptor snapshot through the Web OS compatibility bridge. */
#include "webos.h"
#include <stdlib.h>
#include <unistd.h>
OS_IMPORT("initial_cwd") int os_initial_cwd(char *buffer, int capacity);
__attribute__((constructor)) static void initialize_cwd(void) {
  char path[4096];
  int n = os_initial_cwd(path, sizeof(path));
  if (n < 0 || n >= (int)sizeof(path))
    _Exit(126);
  path[n] = 0;
  if (chdir(path))
    _Exit(126);
}
