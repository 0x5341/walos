/* Minimal WASI build header; upstream implementation files remain unchanged. */
#ifndef WALOS_SBASE_UTIL_H
#define WALOS_SBASE_UTIL_H
#include <stdio.h>
#include <stddef.h>
#include <sys/types.h>
#include "arg.h"
void eprintf(const char *, ...);
void weprintf(const char *, ...);
void enprintf(int, const char *, ...);
int concat(int,const char *,int,const char *);
ssize_t writeall(int,const void *,size_t);
#endif
