#!/bin/sh
# Builds both WebAssembly modules reproducibly into src/generated/.
set -eu
cd "$(dirname "$0")/.."
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
# Strip local paths so the module does not depend on where it was built.
sep=$(printf '\037')
export CARGO_ENCODED_RUSTFLAGS="--remap-path-prefix=$PWD=/roots-local${sep}--remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo"
cargo build --locked --release --target wasm32-unknown-unknown -p roots-wasm -p roots-pdf-wasm
out=src/generated
rm -rf "$out"
mkdir -p "$out"
for name in roots_wasm roots_pdf_wasm; do
  wasm-bindgen --target web --out-dir "$out" "target/wasm32-unknown-unknown/release/$name.wasm"
  wasm-opt -Oz --strip-debug --strip-producers \
    --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
    --enable-mutable-globals --enable-reference-types --enable-multivalue \
    "$out/${name}_bg.wasm" -o "$out/${name}_bg.wasm"
done
ls -l "$out"
