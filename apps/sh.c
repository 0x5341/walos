/* A deliberately small WASI shell. Parsing and process operations live in Wasm.
 */
#include "webos.h"
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#define MAX_ARGS 64
#define MAX_CMDS 16
struct command {
  char *argv[MAX_ARGS];
  int argc;
  char *in, *out;
  int append;
};
static int status, token_literal, parse_error;
static char *token(char **cursor) {
  token_literal = 0;
  char *p = *cursor;
  while (*p == ' ' || *p == '\t' || *p == '\n')
    p++;
  if (!*p) {
    *cursor = p;
    return NULL;
  }
  char buf[4096];
  size_t n = 0;
  char quote = 0;
  if (strchr("|<>", *p)) {
    buf[n++] = *p++;
    if (buf[0] == '>' && *p == '>')
      buf[n++] = *p++;
  } else
    while (*p && (quote || !strchr(" \t\n|<>", *p))) {
      if (*p == '\'' || *p == '"') {
        if (!quote) {
          token_literal = 1;
          quote = *p++;
          continue;
        }
        if (quote == *p) {
          quote = 0;
          p++;
          continue;
        }
      }
      if (*p == '\\' && quote != '\'' && p[1]) {
        token_literal = 1;
        p++;
      }
      if (n + 1 >= sizeof(buf)) {
        parse_error = 1;
        return NULL;
      }
      buf[n++] = *p++;
    }
  if (quote) {
    parse_error = 1;
    *cursor = p;
    return NULL;
  }
  buf[n] = 0;
  *cursor = p;
  return strdup(buf);
}
static int json_string(char *buf, size_t cap, size_t *used, const char *value) {
  if (*used + 2 >= cap)
    return -1;
  buf[(*used)++] = '"';
  for (; *value; value++) {
    unsigned char ch = *value;
    if (ch < 32) {
      if (*used + 6 >= cap)
        return -1;
      *used += (size_t)snprintf(buf + *used, cap - *used, "\\u%04x", ch);
    } else {
      if (*used + 2 >= cap)
        return -1;
      if (ch == '"' || ch == '\\')
        buf[(*used)++] = '\\';
      buf[(*used)++] = ch;
    }
  }
  if (*used + 2 >= cap)
    return -1;
  buf[(*used)++] = '"';
  buf[*used] = 0;
  return 0;
}
static int options(char *buf, size_t cap, struct command *c) {
  size_t n = 0;
  n += (size_t)snprintf(buf + n, cap - n, "{\"argv\":[");
  for (int i = 0; i < c->argc; i++) {
    if (i)
      buf[n++] = ',';
    if (json_string(buf, cap, &n, c->argv[i]))
      return -1;
  }
  n += (size_t)snprintf(buf + n, cap - n, "],\"env\":{");
  extern char **environ;
  for (int i = 0; environ[i]; i++) {
    char *entry = strdup(environ[i]), *eq = strchr(entry, '=');
    if (!eq) {
      free(entry);
      continue;
    }
    *eq = 0;
    if (i)
      buf[n++] = ',';
    if (json_string(buf, cap, &n, entry)) {
      free(entry);
      return -1;
    }
    buf[n++] = ':';
    if (json_string(buf, cap, &n, eq + 1)) {
      free(entry);
      return -1;
    }
    free(entry);
  }
  n += (size_t)snprintf(buf + n, cap - n, "}}");
  return (int)n;
}
static int find_exe(const char *name) {
  if (strchr(name, '/'))
    return open(name, O_RDONLY);
  const char *env = getenv("PATH");
  char *paths = strdup(env ? env : "/bin"), *save = NULL, *part;
  int fd = -1;
  for (part = strtok_r(paths, ":", &save); part;
       part = strtok_r(NULL, ":", &save)) {
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "%s/%s", part, name) >= (int)sizeof(path))
      continue;
    if ((fd = open(path, O_RDONLY)) >= 0)
      break;
  }
  free(paths);
  return fd;
}
static int execute(char *line) {
  struct command cmds[MAX_CMDS] = {0};
  int count = 1;
  char *cursor = line, *t;
  int bad = 0;
  parse_error = 0;
  while ((t = token(&cursor))) {
    struct command *c = &cmds[count - 1];
    if (!token_literal && !strcmp(t, "|")) {
      free(t);
      if (!c->argc || count == MAX_CMDS) {
        bad = 1;
        break;
      }
      count++;
    } else if (!token_literal &&
               (!strcmp(t, "<") || !strcmp(t, ">") || !strcmp(t, ">>"))) {
      int input = t[0] == '<', append = t[1] == '>';
      free(t);
      char *path = token(&cursor);
      if (!path || (!token_literal && strpbrk(path, "|<>"))) {
        free(path);
        bad = 1;
        break;
      }
      if (input) {
        free(c->in);
        c->in = path;
      } else {
        free(c->out);
        c->out = path;
        c->append = append;
      }
    } else {
      if (c->argc == MAX_ARGS - 1) {
        free(t);
        bad = 1;
        break;
      }
      if (!token_literal && !strcmp(t, "$?")) {
        char b[16];
        snprintf(b, sizeof(b), "%d", status);
        free(t);
        t = strdup(b);
      } else if (!token_literal && t[0] == '$' && t[1]) {
        char *v = getenv(t + 1);
        free(t);
        t = strdup(v ? v : "");
      }
      c->argv[c->argc++] = t;
    }
  }
  if (!cmds[0].argc && !parse_error && !bad)
    goto cleanup;
  if (bad || parse_error || !cmds[count - 1].argc) {
    fprintf(stderr, "sh: syntax error\n");
    status = 2;
    goto cleanup;
  }
  if (count == 1 && !strcmp(cmds[0].argv[0], "exit")) {
    exit(cmds[0].argc > 1 ? atoi(cmds[0].argv[1]) : status);
  }
  if (count == 1 && !strcmp(cmds[0].argv[0], "cd")) {
    char *dir = cmds[0].argc > 1 ? cmds[0].argv[1] : "/home";
    if (chdir(dir)) {
      perror("cd");
      status = 1;
    } else {
      char buf[PATH_MAX];
      if (getcwd(buf, sizeof(buf)))
        setenv("PWD", buf, 1);
      status = 0;
    }
    goto cleanup;
  }
  if (count == 1 && !strcmp(cmds[0].argv[0], "export")) {
    status = 0;
    for (int i = 1; i < cmds[0].argc; i++) {
      char *eq = strchr(cmds[0].argv[i], '=');
      if (!eq) {
        status = 2;
        continue;
      }
      *eq = 0;
      setenv(cmds[0].argv[i], eq + 1, 1);
    }
    goto cleanup;
  }
  int pipes[MAX_CMDS - 1][2];
  for (int i = 0; i < MAX_CMDS - 1; i++)
    pipes[i][0] = pipes[i][1] = -1;
  uint32_t handles[MAX_CMDS] = {0};
  int started = 0, failed = 0, input = -1;
  for (int i = 0; i < count - 1; i++)
    if (os_pipe(pipes[i])) {
      failed = 1;
      break;
    }
  for (int i = 0; i < count && !failed; i++) {
    struct command *c = &cmds[i];
    int in = i ? pipes[i - 1][0] : -1, out = i < count - 1 ? pipes[i][1] : -1;
    if (c->in) {
      if (in >= 0) {
        close(in);
        pipes[i - 1][0] = -1;
      }
      in = open(c->in, O_RDONLY);
      if (in < 0) {
        perror(c->in);
        failed = 1;
        break;
      }
    }
    if (c->out) {
      if (out >= 0) {
        close(out);
        pipes[i][1] = -1;
      }
      out = open(c->out, O_WRONLY | O_CREAT | (c->append ? O_APPEND : O_TRUNC),
                 0666);
      if (out < 0) {
        if (c->in && in >= 0)
          close(in);
        perror(c->out);
        failed = 1;
        break;
      }
    }
    int exe = find_exe(c->argv[0]), cwd = open(".", O_RDONLY | O_DIRECTORY);
    char json[32768];
    int n = options(json, sizeof(json), c);
    int err = exe < 0 || cwd < 0 || n < 0
                  ? 1
                  : os_spawn(exe, cwd, json, n, in, out, -1, &handles[i]);
    if (exe >= 0)
      close(exe);
    if (cwd >= 0)
      close(cwd);
    if (i)
      pipes[i - 1][0] = -1;
    if (i < count - 1)
      pipes[i][1] = -1;
    if (err) {
      if (in >= 0)
        close(in);
      if (out >= 0)
        close(out);
      fprintf(stderr, "sh: cannot start %s (%d)\n", c->argv[0], err);
      failed = 1;
      break;
    }
    started++;
    if (i == 0 && in < 0)
      input = (int)handles[0];
  }
  for (int i = 0; i < count - 1; i++) {
    if (pipes[i][0] >= 0)
      close(pipes[i][0]);
    if (pipes[i][1] >= 0)
      close(pipes[i][1]);
  }
  if (failed) {
    for (int i = 0; i < started; i++)
      os_stop(handles[i]);
    status = 127;
  } else
    os_foreground(handles, started, input);
  for (int i = 0; i < started; i++) {
    uint32_t result[2];
    int err = os_wait(handles[i], result);
    if (!failed && i == started - 1)
      status = err ? 125 : (int)result[1];
  }
cleanup:
  for (int i = 0; i < count; i++) {
    for (int j = 0; j < cmds[i].argc; j++)
      free(cmds[i].argv[j]);
    free(cmds[i].in);
    free(cmds[i].out);
  }
  return status;
}
int main(void) {
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
  setenv("PATH", "/bin", 0);
  char *line = NULL;
  size_t cap = 0;
  printf("walos · WASI Preview 1\n");
  for (;;) {
    char cwd[PATH_MAX];
    printf("%s $ ", getcwd(cwd, sizeof(cwd)) ? cwd : "?");
    if (getline(&line, &cap, stdin) < 0)
      break;
    execute(line);
    os_foreground(NULL, 0, 0);
  }
  free(line);
  return status;
}
