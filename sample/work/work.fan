let work = "a work";
let host = "httpbingo.org";

rq postJson`
    POST https://{host}/post
    Host: {host}
    Content-Type: application/json

    {
        "name": "Gauss",
        "age": 6,
        "address": {
            "street": "19 Hear Sea Street",
            "city": "DaLian"
        },
        "phones": [
            "+86 13098767890",
            "+86 15876567890"
        ]
    }
`[status == 200]

test postJson {
    let response = postJson->;
    response.status
}