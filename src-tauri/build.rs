fn main() {
    println!(
        "cargo:rustc-env=ROOTS_TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        tauri_build::build();
    }
}
