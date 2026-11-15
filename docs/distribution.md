# Distribution

Roots Local is distributed through a Homebrew tap as an ad-hoc signed DMG for Apple Silicon. The project does not use an Apple Developer ID or notarization.

## Install

```sh
brew install --cask gitmaximilian/tap/roots-local
```

Homebrew 7 asks you to trust third-party casks. Installing by the full name trusts only this cask. `brew uninstall --cask roots-local` removes the app; add `--zap` to remove its caches and saved window state.

Without notarization, macOS Gatekeeper refuses to open a downloaded app that carries the quarantine flag. The cask removes that flag from `Roots Local.app` after installing. You therefore rely on the checksum in the cask and on this repository's release workflow instead of Apple's notarization service. Every release publishes `SHA256SUMS`, and the cask pins the same SHA-256.

Homebrew 7 offers no declarative step for clearing quarantine, so `brew style` reports the cask's `postflight` block as a convention offense. The block still runs, and a local install with Homebrew 7.0.13 confirmed it.

## Publish a release

1. Set the same version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
2. Push a tag `v<version>`. The [release workflow](../.github/workflows/release.yml) checks that the tag matches the version, runs the tests, builds and ad-hoc signs the app, verifies the signature, packages `Roots-Local_<version>_arm64.dmg`, and creates the GitHub release with `SHA256SUMS`.
3. Download `SHA256SUMS` from the release and update the cask:

   ```sh
   python3 scripts/update_cask.py <version> SHA256SUMS
   ```

4. Copy `packaging/homebrew/Casks/roots-local.rb` to `Casks/roots-local.rb` in the `gitmaximilian/homebrew-tap` repository and push it.

## Verify a release

```sh
brew install --cask gitmaximilian/tap/roots-local
codesign --verify --deep --strict "/Applications/Roots Local.app"
open -a "Roots Local"
```

Then import the synthetic example offline and export both PDFs as described in [release acceptance](test-status.md#release-acceptance).
