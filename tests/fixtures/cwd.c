/* An actual Wasm consumer of initial cwd. Failure occurs after READY, in Wasm. */
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#ifdef WALOS_P2
#include <wasi/wasip2.h>
#include <string.h>
int main(void) {
  wasip2_string_t cwd;
  if (!environment_initial_cwd(&cwd)) return 126;
  char *path = malloc(cwd.len + 1);
  if (!path) return 126;
  memcpy(path, cwd.ptr, cwd.len); path[cwd.len] = 0;
  wasip2_string_free(&cwd);
  int error = chdir(path); free(path);
  if (error) return 126;
  char current[4096];
  if (!getcwd(current, sizeof(current))) return 126;
  puts(current);
  return 0;
}
#else
int main(void) {
  char current[4096];
  if (!getcwd(current, sizeof(current))) return 126;
  puts(current);
  return 0;
}
#endif
