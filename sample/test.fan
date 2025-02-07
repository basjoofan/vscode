let host = "httpbin.org";

request get`
    GET http://{host}/get
    Host: {host}
    Connection: close
`[status == 200];

test call {
    let response = get();
    response.status
}