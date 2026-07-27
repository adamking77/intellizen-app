#[allow(dead_code)]
#[path = "../src/runtimes.rs"]
mod runtimes;

use runtimes::{EventSink, NativeRuntimeEvent, RuntimeRunInput};
use serde::Serialize;
use std::{
    io::{self, Read},
    sync::Arc,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeExit {
    kind: &'static str,
    reason: String,
    exit_code: Option<i32>,
}

#[tokio::main]
async fn main() {
    let mut input_json = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input_json) {
        eprintln!("Failed to read runtime probe input: {error}");
        std::process::exit(1);
    }
    let input: RuntimeRunInput = match serde_json::from_str(&input_json) {
        Ok(input) => input,
        Err(error) => {
            eprintln!("Invalid runtime probe input: {error}");
            std::process::exit(1);
        }
    };

    let sink: EventSink = Arc::new(|event: NativeRuntimeEvent| {
        println!(
            "{}",
            serde_json::to_string(&event).expect("serialize native runtime event")
        );
    });
    match runtimes::run_process(input, sink).await {
        Ok(exit) => {
            println!(
                "{}",
                serde_json::to_string(&ProbeExit {
                    kind: "native_exit",
                    reason: exit.reason,
                    exit_code: exit.exit_code,
                })
                .expect("serialize native runtime exit")
            );
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
