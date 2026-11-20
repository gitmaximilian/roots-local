//! WebAssembly bindings for the Typst PDF renderer.
//!
//! Loaded by the worker only when a PDF is requested. It receives the prepared
//! report data and the font files from the worker and returns PDF bytes. It has
//! no access to the network or to any storage.

use roots_pdf::Fonts;
use std::cell::OnceCell;
use wasm_bindgen::prelude::*;

thread_local! {
    static FONTS: OnceCell<Fonts> = const { OnceCell::new() };
}

/// Installs the font files once. Later calls are ignored.
#[wasm_bindgen]
pub fn load_fonts(files: Vec<js_sys::Uint8Array>) -> usize {
    FONTS.with(|fonts| {
        fonts
            .get_or_init(|| Fonts::new(files.iter().map(js_sys::Uint8Array::to_vec)))
            .len()
    })
}

/// Compiles the report or medicine pass from prepared `report.json` bytes.
#[wasm_bindgen]
pub fn render(pass: bool, data: Vec<u8>) -> Result<Vec<u8>, String> {
    FONTS.with(|fonts| {
        let fonts = fonts
            .get()
            .ok_or("Die Schriften für den PDF-Export fehlen.")?;
        roots_pdf::render(pass, data, fonts)
    })
}
