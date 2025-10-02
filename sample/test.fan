let host = "httpbin.org";

rq get`
    GET https://{host}/get
    Host: {host}
    Connection: close
`[status == 201];

  test
 call 
  {
    let response = get->;
    response.status
}