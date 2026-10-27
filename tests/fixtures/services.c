#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
int main(int argc, char **argv) {
  struct timespec wall, mono, resolution;
  unsigned char bytes[128] = {0};
  if (clock_gettime(CLOCK_REALTIME, &wall) || clock_gettime(CLOCK_MONOTONIC, &mono) ||
      clock_getres(CLOCK_MONOTONIC, &resolution) || getentropy(bytes, sizeof(bytes)))
    return 1;
  if (wall.tv_sec < 1700000000 || wall.tv_nsec < 0 || wall.tv_nsec >= 1000000000 ||
      mono.tv_sec < 0 || resolution.tv_sec < 0 || resolution.tv_nsec <= 0)
    return 2;
  int nonzero = 0;
  for (unsigned i = 0; i < sizeof(bytes); i++) nonzero |= bytes[i];
  if (!nonzero) return 3;
  printf("argc=%d\n", argc);
  for (int i = 0; i < argc; i++) printf("arg=%s\n", argv[i]);
  printf("VALUE=%s\n", getenv("VALUE") ? getenv("VALUE") : "missing");
  printf("PWD=%s\n", getenv("PWD") ? getenv("PWD") : "missing");
  puts("services-ok");
  return 0;
}
