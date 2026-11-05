/* Small streaming HTTP client using the pinned WASI 0.3.2 interfaces. */
#include "command.h"
#include <stdlib.h>
#include <string.h>

/* Pump an upload while waiting for headers, download or stdout. This avoids
 * deadlocking a server that starts echoing before it consumes the whole body. */
static struct {
  uint32_t writer;
  const uint8_t *bytes;
  size_t length, offset;
  bool failed;
} upload;
static void upload_progress(command_waitable_status_t status) {
  while (upload.writer && status != COMMAND_WAITABLE_STATUS_BLOCKED) {
    if (COMMAND_WAITABLE_STATE(status) != COMMAND_WAITABLE_COMPLETED) upload.failed = true;
    else upload.offset += COMMAND_WAITABLE_COUNT(status);
    if (upload.failed || upload.offset == upload.length) {
      wasi_http_types_stream_u8_drop_writable(upload.writer);
      upload.writer = 0;
      break;
    }
    status = wasi_http_types_stream_u8_write(upload.writer, upload.bytes + upload.offset, upload.length - upload.offset);
  }
}
static command_waitable_status_t completed(uint32_t handle, command_waitable_status_t status) {
  if (status != COMMAND_WAITABLE_STATUS_BLOCKED) return status;
  command_waitable_set_t set = command_waitable_set_new();
  command_waitable_join(handle, set);
  if (upload.writer) command_waitable_join(upload.writer, set);
  command_event_t event;
  for (;;) {
    command_waitable_set_wait(set, &event);
    if (event.waitable == handle) break;
    if (event.waitable == upload.writer) {
      command_waitable_join(upload.writer, 0);
      upload_progress(event.code);
      if (upload.writer) command_waitable_join(upload.writer, set);
    }
  }
  if (upload.writer) command_waitable_join(upload.writer, 0);
  command_waitable_join(handle, 0); command_waitable_set_drop(set);
  return event.code;
}
static void subtask(command_subtask_status_t status) {
  command_subtask_t handle = COMMAND_SUBTASK_HANDLE(status);
  if (COMMAND_SUBTASK_STATE(status) != COMMAND_SUBTASK_RETURNED) {
    while (completed(handle, COMMAND_WAITABLE_STATUS_BLOCKED) != COMMAND_SUBTASK_RETURNED) {}
  }
  if (handle) command_subtask_drop(handle);
}
static void stop_upload(void) {
  uint32_t writer = upload.writer;
  upload.writer = 0;
  if (writer) {
    completed(writer, wasi_http_types_stream_u8_cancel_write(writer));
    wasi_http_types_stream_u8_drop_writable(writer);
  }
}
static bool output(bool error, const uint8_t *bytes, size_t length) {
  wasi_cli_stdin_stream_u8_writer_t writer;
  wasi_cli_stdin_stream_u8_t stream = wasi_cli_stdin_stream_u8_new(&writer);
  uint32_t future = error ? wasi_cli_stderr_write_via_stream(stream) : wasi_cli_stdout_write_via_stream(stream);
  size_t offset = 0;
  while (offset < length) {
    command_waitable_status_t status = completed(writer, wasi_cli_stdin_stream_u8_write(writer, (uint8_t *)bytes + offset, length - offset));
    if (COMMAND_WAITABLE_STATE(status) != COMMAND_WAITABLE_COMPLETED || !COMMAND_WAITABLE_COUNT(status)) return false;
    offset += COMMAND_WAITABLE_COUNT(status);
  }
  wasi_cli_stdin_stream_u8_drop_writable(writer);
  if (error) {
    wasi_cli_stderr_result_void_error_code_t result;
    command_waitable_status_t status = completed(future, wasi_cli_stderr_future_result_void_error_code_read(future, &result));
    wasi_cli_stderr_future_result_void_error_code_drop_readable(future);
    return COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED && !result.is_err;
  }
  wasi_cli_stdout_result_void_error_code_t result;
  command_waitable_status_t status = completed(future, wasi_cli_stdout_future_result_void_error_code_read(future, &result));
  wasi_cli_stdout_future_result_void_error_code_drop_readable(future);
  return COMMAND_WAITABLE_STATE(status) == COMMAND_WAITABLE_COMPLETED && !result.is_err;
}
static bool say(bool error, const char *text) { return output(error, (const uint8_t *)text, strlen(text)); }
static command_string_t text(char *value) { return (command_string_t){(uint8_t *)value, strlen(value)}; }
static char *copy(const uint8_t *data, size_t length) { char *out=malloc(length+1); if(out){memcpy(out,data,length);out[length]=0;}return out; }
static bool fail(const char *message) { say(true,"curl: "); say(true,message); say(true,"\n"); return false; }
static bool http_error(wasi_http_types_error_code_t *error) {
  const char *message="HTTP request failed";
  switch(error->tag){
    case WASI_HTTP_TYPES_ERROR_CODE_DNS_ERROR: message="DNS lookup failed";break;
    case WASI_HTTP_TYPES_ERROR_CODE_CONNECTION_REFUSED: message="connection refused";break;
    case WASI_HTTP_TYPES_ERROR_CODE_CONNECTION_TERMINATED: message="connection terminated (check the selected exit node)";break;
    case WASI_HTTP_TYPES_ERROR_CODE_CONNECTION_TIMEOUT: message="connection timed out";break;
    case WASI_HTTP_TYPES_ERROR_CODE_HTTP_RESPONSE_TIMEOUT: message="response timed out";break;
    case WASI_HTTP_TYPES_ERROR_CODE_TLS_CERTIFICATE_ERROR: message="TLS certificate verification failed";break;
    case WASI_HTTP_TYPES_ERROR_CODE_HTTP_REQUEST_DENIED: message="request denied";break;
    case WASI_HTTP_TYPES_ERROR_CODE_HTTP_REQUEST_URI_INVALID: message="invalid URL";break;
    default:break;
  }
  fail(message); wasi_http_types_error_code_free(error); return false;
}
static bool fields(wasi_http_types_own_fields_t headers) {
  wasi_http_types_list_tuple2_field_name_field_value_t entries;
  wasi_http_types_method_fields_copy_all(wasi_http_types_borrow_fields(headers),&entries);
  bool success=true;
  for(size_t i=0;i<entries.len && success;i++)success=output(false,entries.ptr[i].f0.ptr,entries.ptr[i].f0.len)&&say(false,": ")&&output(false,entries.ptr[i].f1.ptr,entries.ptr[i].f1.len)&&say(false,"\r\n");
  wasi_http_types_list_tuple2_field_name_field_value_free(&entries);wasi_http_types_fields_drop_own(headers);return success;
}
static bool execute(void) {
  command_list_string_t args; wasi_cli_environment_get_arguments(&args);
  char *url=NULL,*method=NULL,*data=NULL;bool include=false;
  for(size_t i=1;i<args.len;i++){
    char *arg=copy(args.ptr[i].ptr,args.ptr[i].len);if(!arg)return fail("out of memory");
    if(!strcmp(arg,"-h")||!strcmp(arg,"--help")){free(arg);command_list_string_free(&args);return say(false,"Usage: curl [-i] [-X METHOD] [-d TEXT] http[s]://host/path\nStreams the response body. Redirects are returned without following them.\n");}
    if(!strcmp(arg,"-i")||!strcmp(arg,"--include")){include=true;free(arg);continue;}
    if(!strcmp(arg,"-X")||!strcmp(arg,"--request")||!strcmp(arg,"-d")||!strcmp(arg,"--data")){
      bool body=arg[1]=='d'||!strcmp(arg,"--data");free(arg);
      if(++i>=args.len)return fail("option requires a value");
      char *value=copy(args.ptr[i].ptr,args.ptr[i].len);if(!value)return fail("out of memory");
      if(body){free(data);data=value;}else{free(method);method=value;}continue;
    }
    if(arg[0]=='-'||url){free(arg);return fail("expected one URL; use --help for usage");}url=arg;
  }
  command_list_string_free(&args);
  if(!url)return fail("URL is required; use --help for usage");
  bool https=!strncmp(url,"https://",8);size_t scheme=https?8:7;
  if(!https&&strncmp(url,"http://",7))return fail("URL must start with http:// or https://");
  char *authority=url+scheme,*end=authority+strcspn(authority,"/?#");
  if(end==authority||memchr(authority,'@',end-authority)||strchr(url,'\\'))return fail("invalid URL");
  char *host=copy((uint8_t *)authority,end-authority),*path;
  if(*end=='/')path=copy((uint8_t *)end,strlen(end));
  else if(*end=='?'){path=malloc(strlen(end)+2);if(path){path[0]='/';strcpy(path+1,end);}}
  else path=copy((uint8_t *)"/",1);
  if(!host||!path)return fail("out of memory");char *fragment=strchr(path,'#');if(fragment)*fragment=0;
  wasi_http_types_future_result_option_own_trailers_error_code_writer_t trailer_writer;
  wasi_http_types_future_result_option_own_trailers_error_code_t trailer=wasi_http_types_future_result_option_own_trailers_error_code_new(&trailer_writer);
  wasi_http_types_stream_u8_writer_t body_writer=0;
  wasi_http_types_stream_u8_t body=0;if(data)body=wasi_http_types_stream_u8_new(&body_writer);
  wasi_http_types_tuple2_own_request_future_result_void_error_code_t request;
  wasi_http_types_static_request_new(wasi_http_types_constructor_fields(),data?&body:NULL,trailer,NULL,&request);
  wasi_http_types_result_option_own_trailers_error_code_t empty={0};
  completed(trailer_writer,wasi_http_types_future_result_option_own_trailers_error_code_write(trailer_writer,&empty));
  wasi_http_types_future_result_option_own_trailers_error_code_drop_writable(trailer_writer);
  wasi_http_types_scheme_t protocol={.tag=https?WASI_HTTP_TYPES_SCHEME_HTTPS:WASI_HTTP_TYPES_SCHEME_HTTP};
  command_string_t host_text=text(host),path_text=text(path);
  wasi_http_types_method_t verb={.tag=WASI_HTTP_TYPES_METHOD_OTHER,.val.other=text(method?method:data?"POST":"GET")};
  if(!wasi_http_types_method_request_set_scheme(wasi_http_types_borrow_request(request.f0),&protocol)||!wasi_http_types_method_request_set_authority(wasi_http_types_borrow_request(request.f0),&host_text)||!wasi_http_types_method_request_set_path_with_query(wasi_http_types_borrow_request(request.f0),&path_text)||!wasi_http_types_method_request_set_method(wasi_http_types_borrow_request(request.f0),&verb))return fail("invalid URL or method");
  wasi_http_client_result_own_response_error_code_t reply;
  command_subtask_status_t sending=wasi_http_client_send(request.f0,&reply);
  if(data){upload.writer=body_writer;upload.bytes=(uint8_t *)data;upload.length=strlen(data);upload_progress(COMMAND_WAITABLE_COMPLETED);}
  subtask(sending);
  free(url);free(host);free(path);free(method);
  if(reply.is_err){stop_upload();free(data);return http_error(&reply.val.err);}
  if(include){unsigned status=wasi_http_types_method_response_get_status_code(wasi_http_types_borrow_response(reply.val.ok));char line[]="HTTP 000\r\n";line[5]='0'+status/100;line[6]='0'+status/10%10;line[7]='0'+status%10;if(!say(false,line)||!fields(wasi_http_types_method_response_get_headers(wasi_http_types_borrow_response(reply.val.ok)))||!say(false,"\r\n"))return false;}
  wasi_http_types_future_result_void_error_code_writer_t handled_writer;
  wasi_http_types_future_result_void_error_code_t handled=wasi_http_types_future_result_void_error_code_new(&handled_writer);
  wasi_http_types_tuple2_stream_u8_future_result_option_own_trailers_error_code_t response;
  wasi_http_types_static_response_consume_body(reply.val.ok,handled,&response);
  uint8_t bytes[4096];bool success=true;
  for(;;){command_waitable_status_t status=completed(response.f0,wasi_http_types_stream_u8_read(response.f0,bytes,sizeof(bytes)));if(COMMAND_WAITABLE_STATE(status)==COMMAND_WAITABLE_DROPPED)break;if(COMMAND_WAITABLE_STATE(status)!=COMMAND_WAITABLE_COMPLETED){success=false;break;}if(!output(false,bytes,COMMAND_WAITABLE_COUNT(status))){success=false;break;}}
  wasi_http_types_stream_u8_drop_readable(response.f0);
  wasi_http_types_result_option_own_trailers_error_code_t ending;
  completed(response.f1,wasi_http_types_future_result_option_own_trailers_error_code_read(response.f1,&ending));wasi_http_types_future_result_option_own_trailers_error_code_drop_readable(response.f1);
  if(ending.is_err){http_error(&ending.val.err);success=false;}else if(ending.val.ok.is_some)wasi_http_types_fields_drop_own(ending.val.ok.val);
  wasi_http_types_result_void_error_code_t result={.is_err=!success};if(!success)result.val.err.tag=WASI_HTTP_TYPES_ERROR_CODE_HTTP_RESPONSE_INCOMPLETE;
  completed(handled_writer,wasi_http_types_future_result_void_error_code_write(handled_writer,&result));wasi_http_types_future_result_void_error_code_drop_writable(handled_writer);
  wasi_http_types_result_void_error_code_t sent;
  completed(request.f1,wasi_http_types_future_result_void_error_code_read(request.f1,&sent));wasi_http_types_future_result_void_error_code_drop_readable(request.f1);
  stop_upload();free(data);
  if(sent.is_err){http_error(&sent.val.err);success=false;}
  if(upload.failed)success=false;
  return success;
}
command_callback_code_t exports_wasi_cli_run_run(void){bool success=execute();exports_wasi_cli_run_run_return((exports_wasi_cli_run_result_void_void_t){.is_err=!success});return COMMAND_CALLBACK_CODE_EXIT;}
command_callback_code_t exports_wasi_cli_run_run_callback(command_event_t *event){(void)event;__builtin_trap();}
