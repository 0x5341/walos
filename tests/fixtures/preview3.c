/* Real native async component, generated against the pinned official 0.3.2 WIT.
 * The SDK supplies the compiler/allocator, not its older libc WASI bindings. */
#include "command.h"
#include <string.h>
#include <stdlib.h>

static command_waitable_status_t completed(uint32_t handle, command_waitable_status_t status) {
  if (status != COMMAND_WAITABLE_STATUS_BLOCKED) return status;
  command_waitable_set_t set = command_waitable_set_new();
  command_waitable_join(handle, set);
  command_event_t event;
  command_waitable_set_wait(set, &event);
  command_waitable_join(handle, 0);
  command_waitable_set_drop(set);
  return event.code;
}
static bool print(char *message) {
  wasi_cli_stdin_stream_u8_writer_t writer;
  wasi_cli_stdin_stream_u8_t reader = wasi_cli_stdin_stream_u8_new(&writer);
  wasi_cli_stdout_future_result_void_error_code_t future = wasi_cli_stdout_write_via_stream(reader);
  size_t size = strlen(message), offset = 0;
  while (offset < size) {
    command_waitable_status_t status = completed(writer,
      wasi_cli_stdin_stream_u8_write(writer, (uint8_t *)message + offset, size - offset));
    if (COMMAND_WAITABLE_STATE(status) != COMMAND_WAITABLE_COMPLETED) return false;
    offset += COMMAND_WAITABLE_COUNT(status);
  }
  wasi_cli_stdin_stream_u8_drop_writable(writer);
  wasi_cli_stdout_result_void_error_code_t result;
  command_waitable_status_t status = completed(future,
    wasi_cli_stdout_future_result_void_error_code_read(future, &result));
  wasi_cli_stdout_future_result_void_error_code_drop_readable(future);
  return COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED && !result.is_err;
}

#define STRINGIFY_(x) #x
#define STRINGIFY(x) STRINGIFY_(x)
#define CHECK(value) do { if (!(value)) { print("check failed: " STRINGIFY(__LINE__) "\n"); return false; } } while (0)
static command_string_t text(char *s) { return (command_string_t){(uint8_t *)s, strlen(s)}; }
static bool equals(command_string_t a, char *b) { return a.len == strlen(b) && !memcmp(a.ptr,b,a.len); }

static void subtask(command_subtask_status_t status) {
  command_subtask_t handle = COMMAND_SUBTASK_HANDLE(status);
  if (COMMAND_SUBTASK_STATE(status) != COMMAND_SUBTASK_RETURNED) {
    command_waitable_set_t set = command_waitable_set_new();
    command_waitable_join(handle, set);
    command_event_t event;
    do { command_waitable_set_wait(set, &event); }
    while (event.code != COMMAND_SUBTASK_RETURNED);
    command_waitable_join(handle, 0);
    command_waitable_set_drop(set);
  }
  if (handle) command_subtask_drop(handle);
}
static bool services(void) {
  wasi_clocks_system_clock_instant_t wall;
  wasi_clocks_system_clock_now(&wall);
  CHECK(wall.seconds > 1700000000 && wall.nanoseconds < 1000000000);
  uint64_t before = wasi_clocks_monotonic_clock_now();
  subtask(wasi_clocks_monotonic_clock_wait_for(1000000));
  CHECK(wasi_clocks_monotonic_clock_now() >= before + 1000000);
  command_list_u8_t random;
  wasi_random_random_get_random_bytes(128, &random);
  CHECK(random.len == 128);
  uint8_t bits = 0; for (size_t i=0;i<random.len;i++) bits |= random.ptr[i];
  command_list_u8_free(&random); CHECK(bits);
  CHECK(wasi_random_random_get_random_u64() || wasi_random_random_get_random_u64());
  command_tuple2_u64_u64_t seed; wasi_random_insecure_seed_get_insecure_seed(&seed);
  command_string_t cwd;
  if (wasi_cli_environment_get_initial_cwd(&cwd)) {
    CHECK(equals(cwd,"/")); command_string_free(&cwd);
  }
  command_list_tuple2_string_string_t env;
  wasi_cli_environment_get_environment(&env);
  bool found = false;
  for (size_t i=0;i<env.len;i++) if (equals(env.ptr[i].f0,"VALUE")) found=equals(env.ptr[i].f1,"snapshot");
  command_list_tuple2_string_string_free(&env);
  CHECK(found);
  return print("p3-services-ok\n");
}
static bool relay(void) {
  wasi_cli_stdin_tuple2_stream_u8_future_result_void_error_code_t input;
  wasi_cli_stdin_read_via_stream(&input);
  uint8_t buffer[4096];
  for (;;) {
    command_waitable_status_t status = completed(input.f0, wasi_cli_stdin_stream_u8_read(input.f0, buffer, sizeof(buffer)));
    if (COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_DROPPED) break;
    CHECK(COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED);
    size_t n = COMMAND_WAITABLE_COUNT(status);
    /* Use the same real stream/future path as print, retaining arbitrary bytes. */
    wasi_cli_stdin_stream_u8_writer_t writer;
    wasi_cli_stdin_stream_u8_t reader = wasi_cli_stdin_stream_u8_new(&writer);
    wasi_cli_stdout_future_result_void_error_code_t done = wasi_cli_stdout_write_via_stream(reader);
    size_t offset = 0;
    while (offset<n) {
      command_waitable_status_t st=completed(writer,wasi_cli_stdin_stream_u8_write(writer,buffer+offset,n-offset));
      CHECK(COMMAND_WAITABLE_STATE(st)==COMMAND_WAITABLE_COMPLETED);
      offset+=COMMAND_WAITABLE_COUNT(st);
    }
    wasi_cli_stdin_stream_u8_drop_writable(writer);
    wasi_cli_stdout_result_void_error_code_t result;
    completed(done,wasi_cli_stdout_future_result_void_error_code_read(done,&result));
    wasi_cli_stdout_future_result_void_error_code_drop_readable(done);
    CHECK(!result.is_err);
  }
  wasi_cli_stdin_stream_u8_drop_readable(input.f0);
  wasi_cli_stdin_result_void_error_code_t result;
  completed(input.f1,wasi_cli_stdin_future_result_void_error_code_read(input.f1,&result));
  wasi_cli_stdin_future_result_void_error_code_drop_readable(input.f1);
  return !result.is_err;
}
static bool cancel_input(void) {
  wasi_cli_stdin_tuple2_stream_u8_future_result_void_error_code_t input;
  wasi_cli_stdin_read_via_stream(&input);
  uint8_t byte;
  command_waitable_status_t pending=wasi_cli_stdin_stream_u8_read(input.f0,&byte,1);
  CHECK(pending==COMMAND_WAITABLE_STATUS_BLOCKED);
  command_waitable_status_t cancelled=wasi_cli_stdin_stream_u8_cancel_read(input.f0);
  CHECK(COMMAND_WAITABLE_STATE(cancelled)==COMMAND_WAITABLE_CANCELLED);
  wasi_cli_stdin_stream_u8_drop_readable(input.f0);
  wasi_cli_stdin_result_void_error_code_t result;
  completed(input.f1,wasi_cli_stdin_future_result_void_error_code_read(input.f1,&result));
  wasi_cli_stdin_future_result_void_error_code_drop_readable(input.f1);
  CHECK(!result.is_err);
  return print("p3-input-cancelled\n");
}
static wasi_filesystem_types_borrow_descriptor_t root_dir(void) {
  wasi_filesystem_preopens_list_tuple2_own_descriptor_string_t dirs;
  wasi_filesystem_preopens_get_directories(&dirs);
  wasi_filesystem_types_own_descriptor_t root=dirs.ptr[0].f0;
  for(size_t i=0;i<dirs.len;i++) command_string_free(&dirs.ptr[i].f1);
  for(size_t i=1;i<dirs.len;i++) wasi_filesystem_types_descriptor_drop_own(dirs.ptr[i].f0);
  free(dirs.ptr);
  return wasi_filesystem_types_borrow_descriptor(root);
}
static bool open_file(wasi_filesystem_types_borrow_descriptor_t root,char *path,
  wasi_filesystem_types_open_flags_t of,wasi_filesystem_types_descriptor_flags_t flags,
  wasi_filesystem_types_own_descriptor_t *out) {
  wasi_filesystem_types_method_descriptor_open_at_args_t args={root,0,text(path),of,flags};
  wasi_filesystem_types_result_own_descriptor_error_code_t result;
  subtask(wasi_filesystem_types_method_descriptor_open_at(&args,&result));
  if (result.is_err) return false;
  *out=result.val.ok; return true;
}
static bool filesystem(void) {
  wasi_filesystem_types_borrow_descriptor_t root=root_dir();
  wasi_filesystem_types_own_descriptor_t file;
  CHECK(open_file(root,"native.txt",WASI_FILESYSTEM_TYPES_OPEN_FLAGS_CREATE|WASI_FILESYSTEM_TYPES_OPEN_FLAGS_TRUNCATE,
    WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ|WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_WRITE,&file));
  wasi_filesystem_types_borrow_descriptor_t fd=wasi_filesystem_types_borrow_descriptor(file);
  wasi_filesystem_types_result_descriptor_type_error_code_t type;
  subtask(wasi_filesystem_types_method_descriptor_get_type(fd,&type));
  CHECK(!type.is_err && type.val.ok.tag==WASI_FILESYSTEM_TYPES_DESCRIPTOR_TYPE_REGULAR_FILE);
  wasi_filesystem_types_stream_u8_writer_t writer;
  wasi_filesystem_types_stream_u8_t reader=wasi_filesystem_types_stream_u8_new(&writer);
  wasi_filesystem_types_future_result_void_error_code_t done=wasi_filesystem_types_method_descriptor_write_via_stream(fd,reader,0);
  char *message="p3-filesystem-data\n";
  command_waitable_status_t st=completed(writer,wasi_filesystem_types_stream_u8_write(writer,(uint8_t *)message,strlen(message)));
  CHECK(COMMAND_WAITABLE_COUNT(st)==strlen(message));
  wasi_filesystem_types_stream_u8_drop_writable(writer);
  wasi_filesystem_types_result_void_error_code_t write_result;
  completed(done,wasi_filesystem_types_future_result_void_error_code_read(done,&write_result));
  wasi_filesystem_types_future_result_void_error_code_drop_readable(done);
  CHECK(!write_result.is_err);
  wasi_filesystem_types_tuple2_stream_u8_future_result_void_error_code_t input;
  wasi_filesystem_types_method_descriptor_read_via_stream(fd,0,&input);
  // Dropping the descriptor must not destroy the independently owned stream.
  wasi_filesystem_types_descriptor_drop_own(file);
  uint8_t buffer[128];
  st=completed(input.f0,wasi_filesystem_types_stream_u8_read(input.f0,buffer,sizeof(buffer)));
  CHECK(COMMAND_WAITABLE_COUNT(st)==strlen(message) && !memcmp(buffer,message,strlen(message)));
  st=completed(input.f0,wasi_filesystem_types_stream_u8_read(input.f0,buffer,sizeof(buffer)));
  CHECK(COMMAND_WAITABLE_STATE(st)==COMMAND_WAITABLE_DROPPED);
  wasi_filesystem_types_stream_u8_drop_readable(input.f0);
  completed(input.f1,wasi_filesystem_types_future_result_void_error_code_read(input.f1,&write_result));
  wasi_filesystem_types_future_result_void_error_code_drop_readable(input.f1);
  CHECK(!write_result.is_err);
  wasi_filesystem_types_tuple2_stream_directory_entry_future_result_void_error_code_t entries;
  wasi_filesystem_types_method_descriptor_read_directory(root,&entries);
  bool found=false;
  for (;;) {
    wasi_filesystem_types_directory_entry_t entry;
    st=completed(entries.f0,wasi_filesystem_types_stream_directory_entry_read(entries.f0,&entry,1));
    if (COMMAND_WAITABLE_STATE(st)==COMMAND_WAITABLE_DROPPED) break;
    CHECK(COMMAND_WAITABLE_COUNT(st)==1);
    if(equals(entry.name,"native.txt")) found=true;
    wasi_filesystem_types_directory_entry_free(&entry);
  }
  wasi_filesystem_types_stream_directory_entry_drop_readable(entries.f0);
  completed(entries.f1,wasi_filesystem_types_future_result_void_error_code_read(entries.f1,&write_result));
  wasi_filesystem_types_future_result_void_error_code_drop_readable(entries.f1);
  CHECK(found && !write_result.is_err);
  wasi_filesystem_types_method_descriptor_open_at_args_t missing={root,0,text("missing-file"),0,WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ};
  wasi_filesystem_types_result_own_descriptor_error_code_t error;
  subtask(wasi_filesystem_types_method_descriptor_open_at(&missing,&error));
  CHECK(error.is_err && error.val.err.tag==WASI_FILESYSTEM_TYPES_ERROR_CODE_NO_ENTRY);
  // An EOF stream can still complete with a filesystem error in its Future.
  wasi_filesystem_types_method_descriptor_read_via_stream(root,0,&input);
  st=completed(input.f0,wasi_filesystem_types_stream_u8_read(input.f0,buffer,sizeof(buffer)));
  CHECK(COMMAND_WAITABLE_STATE(st)==COMMAND_WAITABLE_DROPPED);
  wasi_filesystem_types_stream_u8_drop_readable(input.f0);
  completed(input.f1,wasi_filesystem_types_future_result_void_error_code_read(input.f1,&write_result));
  wasi_filesystem_types_future_result_void_error_code_drop_readable(input.f1);
  CHECK(write_result.is_err && write_result.val.err.tag==WASI_FILESYSTEM_TYPES_ERROR_CODE_IS_DIRECTORY);
  return print("p3-fs-ok\n");
}
static bool spawn_one(wasi_filesystem_types_own_descriptor_t exe,char *name,walos_runtime_io_own_input_endpoint_t *in,
  walos_runtime_io_own_output_endpoint_t *out,walos_runtime_process_own_child_process_t *child) {
  command_string_t argv[]={text(name)};
  command_tuple2_string_string_t pwd={text("PWD"),text("/")};
  walos_runtime_process_spawn_args_t args={.executable=wasi_filesystem_types_borrow_descriptor(exe),
    .argv={argv,1},.env={&pwd,1},.stdin_={in!=NULL,in?*in:(walos_runtime_io_own_input_endpoint_t){0}},
    .stdout_={out!=NULL,out?*out:(walos_runtime_io_own_output_endpoint_t){0}}};
  walos_runtime_process_result_own_child_process_spawn_error_t result;
  subtask(walos_runtime_process_spawn(&args,&result));
  if(result.is_err) {
    print("spawn failed\n");
    if(result.val.err.tag==WALOS_RUNTIME_PROCESS_SPAWN_ERROR_INITIALIZATION || result.val.err.tag==WALOS_RUNTIME_PROCESS_SPAWN_ERROR_INTERNAL) {
      command_string_t value=result.val.err.val.initialization;
      char *buffer=malloc(value.len+1); memcpy(buffer,value.ptr,value.len); buffer[value.len]=0;
      print(buffer); free(buffer);
    }
    return false;
  }
  *child=result.val.ok; return true;
}
static bool wait_child(walos_runtime_process_own_child_process_t child) {
  walos_runtime_process_result_exit_result_wait_error_t exit;
  walos_runtime_process_borrow_child_process_t h=walos_runtime_process_borrow_child_process(child);
  subtask(walos_runtime_process_method_child_process_wait(h,&exit));
  CHECK(!exit.is_err && exit.val.ok.tag==WALOS_RUNTIME_PROCESS_EXIT_RESULT_EXITED && exit.val.ok.val.exited==0);
  subtask(walos_runtime_process_method_child_process_wait(h,&exit));
  CHECK(exit.is_err && exit.val.err.tag==WALOS_RUNTIME_PROCESS_WAIT_ERROR_ALREADY_CONSUMED);
  walos_runtime_process_child_process_drop_own(child);
  return true;
}
static bool processes(void) {
  wasi_filesystem_types_borrow_descriptor_t root=root_dir();
  wasi_filesystem_types_own_descriptor_t producer,consumer,hang;
  CHECK(open_file(root,"bin/p3-probe",0,WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ,&producer));
  CHECK(open_file(root,"bin/p2-cat",0,WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ,&consumer));
  CHECK(open_file(root,"bin/hang",0,WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ,&hang));
  walos_runtime_process_own_child_process_t a,b,c;
  walos_runtime_io_tuple2_own_input_endpoint_own_output_endpoint_t hang_pipe;
  subtask(walos_runtime_io_create_pipe(&hang_pipe));
  CHECK(spawn_one(hang,"hang",NULL,&hang_pipe.f1,&c));
  subtask(walos_runtime_process_method_child_process_request_stop(walos_runtime_process_borrow_child_process(c)));
  walos_runtime_process_result_exit_result_wait_error_t exit;
  subtask(walos_runtime_process_method_child_process_wait(walos_runtime_process_borrow_child_process(c),&exit));
  CHECK(!exit.is_err && exit.val.ok.tag==WALOS_RUNTIME_PROCESS_EXIT_RESULT_TERMINATED);
  walos_runtime_process_child_process_drop_own(c);
  walos_runtime_io_input_endpoint_drop_own(hang_pipe.f0);
  wasi_filesystem_types_descriptor_drop_own(hang);
  walos_runtime_io_tuple2_own_input_endpoint_own_output_endpoint_t pipe;
  subtask(walos_runtime_io_create_pipe(&pipe));
  CHECK(spawn_one(producer,"p3-probe",NULL,&pipe.f1,&a));
  CHECK(print("p3-process-ok\n"));
  walos_runtime_io_own_output_endpoint_t output=walos_runtime_io_get_stdout();
  CHECK(spawn_one(consumer,"p2-cat",&pipe.f0,&output,&b));
  // The executable is borrowed, so it can be dropped separately after spawn.
  wasi_filesystem_types_descriptor_drop_own(producer);
  wasi_filesystem_types_descriptor_drop_own(consumer);
  CHECK(walos_runtime_process_method_child_process_pid(walos_runtime_process_borrow_child_process(a)) !=
    walos_runtime_process_method_child_process_pid(walos_runtime_process_borrow_child_process(b)));
  CHECK(wait_child(a)); CHECK(wait_child(b));
  return true;
}

static bool cancel_future(void) {
  walos_runtime_io_tuple2_own_input_endpoint_own_output_endpoint_t pipe;
  subtask(walos_runtime_io_create_pipe(&pipe));
  walos_runtime_io_future_result_u64_error_code_t available=walos_runtime_io_method_output_endpoint_when_writable(
    walos_runtime_io_borrow_output_endpoint(pipe.f1),1);
  walos_runtime_io_result_u64_error_code_t capacity;
  completed(available,walos_runtime_io_future_result_u64_error_code_read(available,&capacity));
  walos_runtime_io_future_result_u64_error_code_drop_readable(available);
  CHECK(!capacity.is_err && capacity.val.ok>0 && capacity.val.ok<=65536);
  walos_runtime_io_future_result_u64_error_code_t pending=walos_runtime_io_method_output_endpoint_when_writable(
    walos_runtime_io_borrow_output_endpoint(pipe.f1),65537);
  walos_runtime_io_future_result_u64_error_code_drop_readable(pending);
  walos_runtime_io_output_endpoint_drop_own(pipe.f1);
  walos_runtime_io_input_endpoint_drop_own(pipe.f0);
  return print("p3-future-cancelled\n");
}
static bool file_process(void) {
  wasi_filesystem_types_borrow_descriptor_t root=root_dir();
  wasi_filesystem_types_own_descriptor_t exe,file;
  CHECK(open_file(root,"bin/p3-probe",0,WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ,&exe));
  CHECK(open_file(root,"p3-child-output",WASI_FILESYSTEM_TYPES_OPEN_FLAGS_CREATE|WASI_FILESYSTEM_TYPES_OPEN_FLAGS_TRUNCATE,
    WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ|WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_WRITE,&file));
  walos_runtime_io_result_own_output_endpoint_filesystem_error_t output;
  subtask(walos_runtime_io_write_via_descriptor(wasi_filesystem_types_borrow_descriptor(file),0,false,&output));
  CHECK(!output.is_err);
  wasi_filesystem_types_descriptor_drop_own(file);
  walos_runtime_process_own_child_process_t child;
  CHECK(spawn_one(exe,"p3-probe",NULL,&output.val.ok,&child));
  wasi_filesystem_types_descriptor_drop_own(exe);
  CHECK(wait_child(child));
  CHECK(open_file(root,"p3-child-output",0,WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ,&file));
  wasi_filesystem_types_tuple2_stream_u8_future_result_void_error_code_t input;
  wasi_filesystem_types_method_descriptor_read_via_stream(wasi_filesystem_types_borrow_descriptor(file),0,&input);
  wasi_filesystem_types_descriptor_drop_own(file);
  char buffer[32]={0};
  command_waitable_status_t st=completed(input.f0,wasi_filesystem_types_stream_u8_read(input.f0,(uint8_t *)buffer,31));
  CHECK(COMMAND_WAITABLE_COUNT(st)==strlen("native-p3-0.3.2\n") && !memcmp(buffer,"native-p3-0.3.2\n",strlen("native-p3-0.3.2\n")));
  wasi_filesystem_types_stream_u8_drop_readable(input.f0);
  wasi_filesystem_types_result_void_error_code_t result;
  completed(input.f1,wasi_filesystem_types_future_result_void_error_code_read(input.f1,&result));
  wasi_filesystem_types_future_result_void_error_code_drop_readable(input.f1);
  CHECK(!result.is_err);
  return print("p3-file-process-ok\n");
}

static bool lifecycle(command_list_string_t args) {
  CHECK(args.len==3);
  char path[128]="bin/";
  CHECK(args.ptr[1].len<100);
  memcpy(path+4,args.ptr[1].ptr,args.ptr[1].len); path[4+args.ptr[1].len]=0;
  wasi_filesystem_types_own_descriptor_t exe;
  CHECK(open_file(root_dir(),path,0,WASI_FILESYSTEM_TYPES_DESCRIPTOR_FLAGS_READ,&exe));
  command_tuple2_string_string_t pwd={text("PWD"),text("/")};
  walos_runtime_process_spawn_args_t spec={.executable=wasi_filesystem_types_borrow_descriptor(exe),
    .argv={&args.ptr[1],1},.env={&pwd,1}};
  walos_runtime_process_result_own_child_process_spawn_error_t result;
  subtask(walos_runtime_process_spawn(&spec,&result));
  CHECK(print(result.is_err?"audit-parent-failed\n":"audit-parent-ready\n"));
  if(equals(args.ptr[2],"trap")) __builtin_trap();
  return !equals(args.ptr[2],"nonzero");
}
static bool execute(void) {
  command_list_string_t args; wasi_cli_environment_get_arguments(&args);
  command_string_t mode=args.len>1?args.ptr[1]:text("hello");

#ifdef WALOS_BENCHMARK
  if (equals(mode,"hold")) {
    wasi_cli_stdin_tuple2_stream_u8_future_result_void_error_code_t input;
    wasi_cli_stdin_read_via_stream(&input);
    uint8_t byte;
    command_waitable_status_t status=completed(input.f0,wasi_cli_stdin_stream_u8_read(input.f0,&byte,1));
    wasi_cli_stdin_stream_u8_drop_readable(input.f0);
    wasi_cli_stdin_result_void_error_code_t result;
    completed(input.f1,wasi_cli_stdin_future_result_void_error_code_read(input.f1,&result));
    wasi_cli_stdin_future_result_void_error_code_drop_readable(input.f1);
    return COMMAND_WAITABLE_COUNT(status)==1 && !result.is_err;
  }
  if(equals(mode,"cpu")) {
    uint32_t value=1;
    for(uint32_t i=0;i<20000000;i++) value=(value^i)*UINT32_C(1664525)+UINT32_C(1013904223);
    char buffer[12], reversed[10]; size_t n=0;
    do { reversed[n++]=(char)('0'+value%10); value/=10; } while(value);
    for(size_t i=0;i<n;i++) buffer[i]=reversed[n-i-1];
    buffer[n]='\n'; buffer[n+1]=0;
    return print(buffer);
  }
  return true;
#else
  if (args.len && equals(args.ptr[0],"p3-lifecycle-parent")) return lifecycle(args);
  if (equals(mode,"future")) return cancel_future();
  if (equals(mode,"file-process")) return file_process();
  if (equals(mode,"services")) return services();
  if (equals(mode,"cat")) return relay();
  if (equals(mode,"cancel")) return cancel_input();
  if (equals(mode,"fs")) return filesystem();
  if (equals(mode,"process")) return processes();
  if (equals(mode,"false")) return false;
  if (equals(mode,"exit130")) { wasi_cli_exit_exit_with_code(130); __builtin_trap(); }
  if (equals(mode,"trap")) __builtin_trap();
  if (equals(mode,"hang")) for(;;) __asm__ volatile("");
  if (equals(mode,"wait")) { subtask(wasi_clocks_monotonic_clock_wait_for(60000000000ULL)); return true; }
  if (equals(mode,"fs-trap")) {
    wasi_filesystem_types_method_descriptor_set_times_args_t args={.self=root_dir(),
      .data_access_timestamp={.tag=WASI_FILESYSTEM_TYPES_NEW_TIMESTAMP_NO_CHANGE},
      .data_modification_timestamp={.tag=WASI_FILESYSTEM_TYPES_NEW_TIMESTAMP_NO_CHANGE}};
    wasi_filesystem_types_result_void_error_code_t result;
    subtask(wasi_filesystem_types_method_descriptor_set_times(&args,&result)); return true;
  }
  if (equals(mode,"http")) { wasi_http_types_constructor_fields(); return true; }
  if (equals(mode,"socket")) { wasi_sockets_types_own_tcp_socket_t socket; wasi_sockets_types_error_code_t error;
    wasi_sockets_types_static_tcp_socket_create(WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4,&socket,&error); return true; }
  if (equals(mode,"timezone")) { command_string_t id; wasi_clocks_timezone_iana_id(&id); return true; }
  return print("native-p3-0.3.2\n");
#endif
}
command_callback_code_t exports_wasi_cli_run_run(void) {
  bool success = execute();
  exports_wasi_cli_run_run_return((exports_wasi_cli_run_result_void_void_t){.is_err = !success});
  return COMMAND_CALLBACK_CODE_EXIT;
}
command_callback_code_t exports_wasi_cli_run_run_callback(command_event_t *event) {
  (void)event;
  __builtin_trap();
}
