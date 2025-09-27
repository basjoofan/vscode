use lib::Context;
use lib::Parser;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, wasm-lib!");
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[wasm_bindgen]
pub fn process_string(input: &str) -> String {
    format!("Processed: '{}' (from Rust WASM)", input)
}

#[wasm_bindgen]
pub async fn eval(text: String) -> String {
    let mut context = Context::new();
    match Parser::new(&text).parse() {
        Ok(source) => match source.eval_block(&source.exprs, &mut context).await {
            Ok(value) => {
                format!("{value}")
            }
            Err(error) => format!("{error}"),
        },
        Err(error) => format!("{error}"),
    }
}
