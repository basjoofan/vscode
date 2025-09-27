let host = "httpbin.org";

rq get`
    GET https://{host}/get
    Host: {host}
    Connection: close
`[status == 200];

test call {
    let response = get->;
    response.status
}