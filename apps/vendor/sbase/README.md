Source: https://github.com/michaelforney/sbase
Revision: b30fb56804bfed69b45ef0e944d2e029e4d26258

cat.c, arg.h, libutil/concat.c, libutil/eprintf.c and libutil/writeall.c are
unmodified upstream sources, compiled with wasi-sdk 27. LICENSE is upstream's
MIT license. util.h is a local subset of declarations, avoiding unrelated
POSIX-only headers. No command implementation changes were required.
