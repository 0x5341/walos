/* Included after the native async test helpers in preview3.c. */
static bool sockets_test(bool denied) {
  wasi_sockets_types_own_tcp_socket_t own;
  wasi_sockets_types_error_code_t error;
  bool created = wasi_sockets_types_static_tcp_socket_create(WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4, &own, &error);
  if (denied) {
    CHECK(!created && error.tag == WASI_SOCKETS_TYPES_ERROR_CODE_ACCESS_DENIED);
    return print("p3-sockets-denied\n");
  }
  CHECK(created);
  wasi_sockets_types_borrow_tcp_socket_t tcp = wasi_sockets_types_borrow_tcp_socket(own);
  wasi_sockets_types_ip_socket_address_t address = {.tag=WASI_SOCKETS_TYPES_IP_SOCKET_ADDRESS_IPV4,
    .val.ipv4={.port=1234,.address={127,0,0,1}}};
  wasi_sockets_types_method_tcp_socket_connect_args_t connect_args = {.self=tcp,.remote_address=address};
  wasi_sockets_types_result_void_error_code_t result;
  subtask(wasi_sockets_types_method_tcp_socket_connect(&connect_args, &result));
  CHECK(!result.is_err);
  CHECK(wasi_sockets_types_method_tcp_socket_set_keep_alive_count(tcp, 3, &error));
  uint32_t count;
  CHECK(wasi_sockets_types_method_tcp_socket_get_keep_alive_count(tcp, &count, &error) && count == 3);
  CHECK(!wasi_sockets_types_method_tcp_socket_set_hop_limit(tcp, 0, &error));
  CHECK(error.tag == WASI_SOCKETS_TYPES_ERROR_CODE_INVALID_ARGUMENT);
  bool keep_alive;
  CHECK(wasi_sockets_types_method_tcp_socket_set_keep_alive_enabled(tcp,true,&error));
  CHECK(wasi_sockets_types_method_tcp_socket_get_keep_alive_enabled(tcp,&keep_alive,&error) && keep_alive);
#define SOCKET_OPTION(name, type, value) do { type actual; \
  CHECK(wasi_sockets_types_method_tcp_socket_set_##name(tcp,value,&error)); \
  CHECK(wasi_sockets_types_method_tcp_socket_get_##name(tcp,&actual,&error) && actual==value); } while(0)
  SOCKET_OPTION(keep_alive_idle_time,uint64_t,2);
  SOCKET_OPTION(keep_alive_interval,uint64_t,3);
  SOCKET_OPTION(hop_limit,uint8_t,42);
  SOCKET_OPTION(receive_buffer_size,uint64_t,32);
  SOCKET_OPTION(send_buffer_size,uint64_t,32);
#undef SOCKET_OPTION
  wasi_sockets_types_stream_u8_writer_t writer;
  wasi_sockets_types_stream_u8_t data = wasi_sockets_types_stream_u8_new(&writer);
  wasi_sockets_types_future_result_void_error_code_t sent = wasi_sockets_types_method_tcp_socket_send(tcp, data);
  wasi_sockets_types_tuple2_stream_u8_future_result_void_error_code_t received;
  wasi_sockets_types_method_tcp_socket_receive(tcp, &received);
  uint8_t input[] = {1,2,3}, output[4];
  command_waitable_status_t status = completed(writer, wasi_sockets_types_stream_u8_write(writer,input,3));
  CHECK(COMMAND_WAITABLE_COUNT(status) == 3);
  wasi_sockets_types_stream_u8_drop_writable(writer);
  size_t total=0;
  for (;;) {
    status=completed(received.f0,wasi_sockets_types_stream_u8_read(received.f0,output+total,4-total));
    if (COMMAND_WAITABLE_STATE(status)==COMMAND_WAITABLE_DROPPED) break;
    CHECK(COMMAND_WAITABLE_STATE(status)==COMMAND_WAITABLE_COMPLETED);
    total+=COMMAND_WAITABLE_COUNT(status);
    CHECK(total<=3);
  }
  CHECK(total==3 && !memcmp(input,output,3));
  status=completed(sent,wasi_sockets_types_future_result_void_error_code_read(sent,&result));
  CHECK(COMMAND_WAITABLE_STATE(status)==COMMAND_WAITABLE_COMPLETED && !result.is_err);
  wasi_sockets_types_future_result_void_error_code_drop_readable(sent);
  status=completed(received.f1,wasi_sockets_types_future_result_void_error_code_read(received.f1,&result));
  CHECK(COMMAND_WAITABLE_STATE(status)==COMMAND_WAITABLE_COMPLETED && !result.is_err);
  wasi_sockets_types_stream_u8_drop_readable(received.f0);
  wasi_sockets_types_future_result_void_error_code_drop_readable(received.f1);
  wasi_sockets_types_tcp_socket_drop_own(own);

  wasi_sockets_types_own_tcp_socket_t listener;
  CHECK(wasi_sockets_types_static_tcp_socket_create(WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4,&listener,&error));
  tcp=wasi_sockets_types_borrow_tcp_socket(listener);
  CHECK(wasi_sockets_types_method_tcp_socket_get_address_family(tcp)==WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4);
  CHECK(wasi_sockets_types_method_tcp_socket_set_listen_backlog_size(tcp,1,&error));
  CHECK(wasi_sockets_types_method_tcp_socket_bind(tcp,&address,&error));
  wasi_sockets_types_ip_socket_address_t local_address;
  CHECK(wasi_sockets_types_method_tcp_socket_get_local_address(tcp,&local_address,&error));
  CHECK(local_address.val.ipv4.port==1234);
  wasi_sockets_types_stream_own_tcp_socket_t accepts;
  CHECK(wasi_sockets_types_method_tcp_socket_listen(tcp,&accepts,&error));
  CHECK(wasi_sockets_types_method_tcp_socket_get_is_listening(tcp));
  status=completed(accepts,wasi_sockets_types_stream_own_tcp_socket_read(accepts,&own,1));
  CHECK(COMMAND_WAITABLE_COUNT(status)==1);
  wasi_sockets_types_tcp_socket_drop_own(own);
  wasi_sockets_types_stream_own_tcp_socket_drop_readable(accepts);
  wasi_sockets_types_tcp_socket_drop_own(listener);

  CHECK(wasi_sockets_types_static_tcp_socket_create(WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4,&own,&error));
  tcp=wasi_sockets_types_borrow_tcp_socket(own);
  connect_args.self=tcp; connect_args.remote_address.val.ipv4.port=1;
  subtask(wasi_sockets_types_method_tcp_socket_connect(&connect_args,&result));
  CHECK(result.is_err && result.val.err.tag==WASI_SOCKETS_TYPES_ERROR_CODE_CONNECTION_REFUSED);
  wasi_sockets_types_tcp_socket_drop_own(own);

  CHECK(wasi_sockets_types_static_tcp_socket_create(WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4,&own,&error));
  tcp=wasi_sockets_types_borrow_tcp_socket(own);
  connect_args.self=tcp; connect_args.remote_address=address;
  subtask(wasi_sockets_types_method_tcp_socket_connect(&connect_args,&result));
  CHECK(!result.is_err);
  wasi_sockets_types_method_tcp_socket_receive(tcp,&received);
  wasi_sockets_types_stream_u8_drop_readable(received.f0);
  status=completed(received.f1,wasi_sockets_types_future_result_void_error_code_read(received.f1,&result));
  CHECK(COMMAND_WAITABLE_STATE(status)==COMMAND_WAITABLE_COMPLETED && !result.is_err);
  wasi_sockets_types_future_result_void_error_code_drop_readable(received.f1);
  wasi_sockets_types_tcp_socket_drop_own(own);

  wasi_sockets_types_own_udp_socket_t udp_own;
  CHECK(wasi_sockets_types_static_udp_socket_create(WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4,&udp_own,&error));
  wasi_sockets_types_borrow_udp_socket_t udp=wasi_sockets_types_borrow_udp_socket(udp_own);
  CHECK(wasi_sockets_types_method_udp_socket_connect(udp,&address,&error));
  wasi_sockets_types_method_udp_socket_send_args_t send_args={.self=udp,.data={input,3}};
  subtask(wasi_sockets_types_method_udp_socket_send(&send_args,&result));
  CHECK(!result.is_err);
  wasi_sockets_types_result_tuple2_list_u8_ip_socket_address_error_code_t packet;
  subtask(wasi_sockets_types_method_udp_socket_receive(udp,&packet));
  CHECK(!packet.is_err && packet.val.ok.f0.len==3 && !memcmp(packet.val.ok.f0.ptr,input,3));
  wasi_sockets_types_result_tuple2_list_u8_ip_socket_address_error_code_free(&packet);
  CHECK(wasi_sockets_types_method_udp_socket_get_address_family(udp)==WASI_SOCKETS_TYPES_IP_ADDRESS_FAMILY_IPV4);
  wasi_sockets_types_ip_socket_address_t actual_address;
  CHECK(wasi_sockets_types_method_udp_socket_get_local_address(udp,&actual_address,&error));
  CHECK(wasi_sockets_types_method_udp_socket_get_remote_address(udp,&actual_address,&error));
  CHECK(actual_address.val.ipv4.port==1234);
  uint8_t hop; uint64_t buffer_size;
  CHECK(wasi_sockets_types_method_udp_socket_set_unicast_hop_limit(udp,42,&error));
  CHECK(wasi_sockets_types_method_udp_socket_get_unicast_hop_limit(udp,&hop,&error) && hop==42);
  CHECK(wasi_sockets_types_method_udp_socket_set_receive_buffer_size(udp,32,&error));
  CHECK(wasi_sockets_types_method_udp_socket_get_receive_buffer_size(udp,&buffer_size,&error) && buffer_size==32);
  CHECK(wasi_sockets_types_method_udp_socket_set_send_buffer_size(udp,32,&error));
  CHECK(wasi_sockets_types_method_udp_socket_get_send_buffer_size(udp,&buffer_size,&error) && buffer_size==32);
  CHECK(wasi_sockets_types_method_udp_socket_disconnect(udp,&error));
  wasi_sockets_types_udp_socket_drop_own(udp_own);

  wasi_sockets_ip_name_lookup_result_list_ip_address_error_code_t lookup;
  subtask(wasi_sockets_ip_name_lookup_resolve_addresses(text("example.test"),&lookup));
  CHECK(!lookup.is_err && lookup.val.ok.len==2);
  wasi_sockets_ip_name_lookup_result_list_ip_address_error_code_free(&lookup);
  subtask(wasi_sockets_ip_name_lookup_resolve_addresses(text("missing.test"),&lookup));
  CHECK(lookup.is_err && lookup.val.err.tag==WASI_SOCKETS_IP_NAME_LOOKUP_ERROR_CODE_NAME_UNRESOLVABLE);
  wasi_sockets_ip_name_lookup_result_list_ip_address_error_code_free(&lookup);
  return print("p3-sockets-ok\n");
}
