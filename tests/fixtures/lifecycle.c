/* Real P1 parent. The test Worker holds completion of this public spawn call
 * so the supervisor can observe each parent-exit/child-READY ordering. */
#include "../../apps/webos.h"
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 3)
    return 99;
  char path[128], options[256];
  snprintf(path, sizeof(path), "/bin/%s", argv[1]);
  snprintf(options, sizeof(options), "{\"argv\":[\"%s\"],\"env\":{}}", argv[1]);
  int exe = open(path, O_RDONLY), cwd = open("/", O_RDONLY | O_DIRECTORY);
  if (exe < 0 || cwd < 0)
    return 98;
  uint32_t child;
  int error = os_spawn(exe, cwd, options, strlen(options), -1, -1, -1, &child);
  puts(error ? "audit-parent-failed" : "audit-parent-ready");
  if (!strcmp(argv[2], "trap"))
    __builtin_trap();
  return !strcmp(argv[2], "nonzero") ? 7 : 0;
}
