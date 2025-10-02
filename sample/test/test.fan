let host = "httpbingo.org";

rq get`
    GET https://{host}/get
    Host: {host}
    Connection: close
`[status == 200]

rq post`
    POST https://{host}/post
    Host: {host}
    Accept-Encoding: gzip, deflate
`[status == 200]

rq post`
    POST https://{host}/post
    Host: {host}
    Accept-Encoding: gzip, deflate
`[status == 200]

rq postForm`
    POST https://{host}/post
    Host: {host}
    Content-Type: application/x-www-form-urlencoded

    a: b
`[status == 200]

rq postMultipart`
    POST https://{host}/post
    Host: {host}
    Content-Type: multipart/form-data

    a: b
    f: @folder/text.txt
`[status == 200]

test get {
    let response = get->;
    response.status
}

test post {
    let response = post->;
    response.status
}

test postForm {
    let response = postForm->;
    response.status
}

test postMultipart {
    let response = postMultipart->;
    response
}