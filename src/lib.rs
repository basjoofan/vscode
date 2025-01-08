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
    fn run(path: String) -> Vec<String> {
        log(&format!("Starting run: {:?}", path));
        let mut results = Vec::new();
        match Parser::new("1 + 1").parse() {
            Ok(Source { exprs, .. }) => {
                for expr in exprs {
                    results.push(expr.to_string());
                }
            }
            Err(error) => log(&format!("error: {}", error)),
        }
        results
    }
}

// Export the Lib to the extension code.
export!(Lib);
