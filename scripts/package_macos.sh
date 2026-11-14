#!/bin/bash
set -euo pipefail
if [[ $# != 2 || ! -d "$1" ]]; then
  printf 'Usage: %s <Roots Local.app> <output.dmg>\n' "$0" >&2
  exit 2
fi
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
ditto "$1" "$stage/Roots Local.app"
ln -s /Applications "$stage/Applications"
hdiutil create -volname "Roots Local" -srcfolder "$stage" -format UDZO "$2"
hdiutil verify "$2"
