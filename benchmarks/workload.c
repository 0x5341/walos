/* The identical observable integer workload is built for P1 and P2 at -O2. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc > 1 && !strcmp(argv[1], "hold")) {
    unsigned char byte;
    return read(0, &byte, 1) == 1 ? 0 : 1;
  }
  if (argc > 1 && !strcmp(argv[1], "cpu")) {
    uint32_t value = 1;
    for (uint32_t i = 0; i < 20000000; ++i)
      value = (value ^ i) * UINT32_C(1664525) + UINT32_C(1013904223);
    printf("%u\n", value);
  }
  return 0;
}
