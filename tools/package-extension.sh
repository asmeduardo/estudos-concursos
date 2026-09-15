#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extension="$root/tec_auto_sync"
version="$(node -p "require('$extension/manifest.json').version")"
output="$root/nexame-tec-extension-v${version}.zip"

rm -f "$output"
cd "$extension"
zip -q -r "$output" manifest.json background.js content.js popup.html popup.css popup.js PRIVACIDADE.md
printf 'Pacote criado: %s\n' "$output"
