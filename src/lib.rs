use lib::Context;
use lib::Parser;
use std::fmt::Write;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub async fn run_test(text: &str, name: &str, base: &str) -> Result<String, String> {
    let mut context = Context::new();
    let source = match Parser::new(&text).parse_with_base(base) {
        Ok(source) => match source.eval_block(&source.exprs, &mut context).await {
            Ok(_) => source,
            Err(error) => return Err(error),
        },
        Err(error) => return Err(error),
    };
    match source.test(&name) {
        Some(test) => {
            let mut string = String::new();
            match &source.eval_block(test, &mut context).await {
                Ok(_) => {}
                Err(error) => {
                    let _ = writeln!(string, "{error}");
                }
            }
            let records = context.records();
            for record in records {
                let _ = writeln!(string, "{record}");
            }
            Ok(string)
        }
        None => Err(format!("Test not found: {name}")),
    }
}
