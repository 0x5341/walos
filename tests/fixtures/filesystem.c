#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
int main(void) {
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
  if (unlink("/tmp/namespace/b") || rmdir("/tmp/namespace"))
    return 5;
  puts("filesystem probe passed");
  return 0;
}
