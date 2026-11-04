#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <time.h>
#include <errno.h>
int main(int argc, char **argv) {
  if (argc > 1 && !strcmp(argv[1], "negative")) {
    struct stat st; errno = 0;
    if (stat("/negative", &st) == 0 || errno != EOVERFLOW) return 12;
    puts("negative timestamp overflow"); return 0;
  }
  if (mkdir("/tmp/namespace", 0700))
    return 1;
  int fd = open("/tmp/namespace/a", O_CREAT | O_WRONLY, 0600);
  if (fd < 0 || write(fd, "abcdef", 6) != 6 || lseek(fd, 2, SEEK_SET) != 2 ||
      write(fd, "XY", 2) != 2 || close(fd))
    return 2;
  if (rename("/tmp/namespace/a", "/tmp/namespace/b"))
    return 3;
  fd = open("/tmp/namespace/b", O_RDONLY);
  char bytes[7] = {0};
  if (fd < 0 || read(fd, bytes, 6) != 6 || strcmp(bytes, "abXYef") || close(fd))
    return 4;
  if (link("/tmp/namespace/b", "/tmp/namespace/hard") ||
      symlink("hard", "/tmp/namespace/sym")) return 6;
  char target[16] = {0};
  if (readlink("/tmp/namespace/sym", target, sizeof(target)) != 4 || strcmp(target, "hard")) return 7;
  struct stat st;
  if (stat("/tmp/namespace/hard", &st) || st.st_nlink != 2 ||
      lstat("/tmp/namespace/sym", &st) || !S_ISLNK(st.st_mode)) return 8;
  fd = open("/tmp/namespace/hard", O_WRONLY);
  struct timespec times[2] = {{123, 987654321}, {456, 123456789}};
  if (fd < 0 || futimens(fd, times) || close(fd) || stat("/tmp/namespace/b", &st) || st.st_mtim.tv_sec != 456 || st.st_mtim.tv_nsec != 123456789) return 9;
  errno = 0;
  if (link("/tmp/namespace/missing", "/tmp/namespace/nope") == 0 || errno != ENOENT) return 10;
  if (unlink("/tmp/namespace/sym") || unlink("/tmp/namespace/hard")) return 11;
  if (unlink("/tmp/namespace/b") || rmdir("/tmp/namespace"))
    return 5;
  puts("filesystem probe passed");
  return 0;
}
