#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
int main(int argc, char **argv) {
  const char *name = strrchr(argv[0], '/');
  name = name ? name + 1 : argv[0];
  if (!strcmp(name, "echo")) {
    for (int i = 1; i < argc; i++)
      printf("%s%s", i > 1 ? " " : "", argv[i]);
    puts("");
    return 0;
  }
  if (!strcmp(name, "pwd")) {
    char buf[PATH_MAX];
    if (!getcwd(buf, sizeof(buf)))
      return 1;
    puts(buf);
    return 0;
  }
  if (!strcmp(name, "env")) {
    extern char **environ;
    for (char **e = environ; *e; e++)
      puts(*e);
    return 0;
  }
  if (!strcmp(name, "false"))
    return 1;
  if (!strcmp(name, "trap")) {
    __builtin_trap();
  }
  if (!strcmp(name, "hang")) {
    for (;;)
      __asm__ volatile("");
  }
  if (!strcmp(name, "grep")) {
    if (argc != 2) {
      fprintf(stderr, "usage: grep pattern\n");
      return 2;
    }
    char *line = NULL;
    size_t cap = 0;
    int found = 0;
    while (getline(&line, &cap, stdin) >= 0)
      if (strstr(line, argv[1])) {
        fputs(line, stdout);
        found = 1;
      }
    free(line);
    return found ? 0 : 1;
  }
  if (!strcmp(name, "sort")) {
    char **lines = NULL, *line = NULL;
    size_t cap = 0, count = 0;
    while (getline(&line, &cap, stdin) >= 0) {
      char **p = realloc(lines, (count + 1) * sizeof(*lines));
      if (!p)
        return 1;
      lines = p;
      lines[count++] = strdup(line);
    }
    free(line);
    for (size_t i = 1; i < count; i++) {
      char *v = lines[i];
      size_t j = i;
      while (j && strcmp(lines[j - 1], v) > 0) {
        lines[j] = lines[j - 1];
        j--;
      }
      lines[j] = v;
    }
    for (size_t i = 0; i < count; i++) {
      fputs(lines[i], stdout);
      free(lines[i]);
    }
    free(lines);
    return 0;
  }
  return 0;
}
