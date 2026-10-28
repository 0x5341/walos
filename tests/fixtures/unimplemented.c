#include <fcntl.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
int main(void) {
  int fd = open("/unimplemented-times", O_CREAT | O_WRONLY, 0600);
  if (fd < 0) return 2;
  struct timespec times[2] = {{1, 0}, {1, 0}};
  return futimens(fd, times) ? 1 : 0;
}
