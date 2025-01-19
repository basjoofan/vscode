// Use a procedural macro to generate bindings for the world we specified in
// `host.wit`
wit_bindgen::generate!({
    // the name of the world in the `*.wit` input file
    world: "lib",
});

use am::Parser;
use am::Source;

struct Lib;

impl Guest for Lib {
    fn run(text: String) -> Vec<String> {
        log(&format!("!text: {}", get("https://httpbin.org/get")));
        let mut results = Vec::new();
        match Parser::new(&text).parse() {
            Ok(Source { exprs, .. }) => {
                for expr in exprs {
                    results.push(expr.to_string());
                }
            }
            Err(error) => log(&format!("error: {}", error)),
        }
        log(&format!("!results: {:?}", results));
        results
    }
}

// Export the Lib to the extension code.
export!(Lib);
