// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if rreadnote_lib::should_run_cli(&args) {
        std::process::exit(rreadnote_lib::run_cli(args));
    }

    rreadnote_lib::run();
}
