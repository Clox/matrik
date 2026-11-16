#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

open_page() {
  local url="$1"
  echo "Öppnar Matrik: $url"
  if ! xdg-open "$url" >/dev/null 2>&1; then
    echo "Kunde inte öppna webbläsaren automatiskt. Öppna $url själv."
  fi
}

# Återanvänd en redan startad lokal Matrik-instans.
for port in {5173..5199}; do
  url="http://127.0.0.1:$port/"
  if curl -fsS --max-time 1 "$url" 2>/dev/null | grep -Fq '<title>Matrik</title>'; then
    open_page "$url"
    exit 0
  fi
done

if curl -fsS --max-time 1 http://127.0.0.1:4173/ 2>/dev/null | grep -Fq '<title>Matrik</title>'; then
  open_page http://127.0.0.1:4173/
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js och npm behövs för att starta Matrik." >&2
  exit 1
fi

if [[ ! -x node_modules/.bin/vite ]]; then
  echo "Installerar projektets beroenden..."
  npm ci
fi

if curl -fsS --max-time 1 http://127.0.0.1:4173/api/status 2>/dev/null | grep -Fq '"driveConfigured"'; then
  # API-servern är redan igång, så bara webbservern behövs.
  npm run dev:client -- --open
else
  npm run dev:open
fi
