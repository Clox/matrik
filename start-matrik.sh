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

node_major() {
  local version
  version="$(node --version 2>/dev/null)" || return 1
  [[ "$version" =~ ^v([0-9]+)\. ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

ensure_node_runtime() {
  # En vanlig terminal kan sakna nvm i PATH och då välja systemets Node 18.
  if [[ "$(node_major || true)" -lt 22 ]]; then
    local nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    if [[ -f "$nvm_script" ]]; then
      # shellcheck source=/dev/null
      source "$nvm_script"
      nvm use --silent 22 >/dev/null 2>&1 || true
    fi
  fi

  if [[ "$(node_major || true)" -lt 22 ]]; then
    echo "Matrik kräver Node.js 22 eller senare. Installerad version: $(node --version 2>/dev/null || echo saknas)." >&2
    echo "Installera Node.js 22 eller kör 'nvm install 22' och försök igen." >&2
    exit 1
  fi
}

# Återanvänd en redan startad lokal Matrik-instans. En Vite-sida utan
# fungerande API räknas inte som en startad app.
existing_page=""
for port in {5173..5199}; do
  url="http://127.0.0.1:$port/"
  if curl -fsS --max-time 1 "$url" 2>/dev/null | grep -Fq '<title>Matrik</title>'; then
    if curl -fsS --max-time 1 "${url}api/status" 2>/dev/null | grep -Fq '"driveConfigured"'; then
      open_page "$url"
      exit 0
    fi
    existing_page="$url"
    break
  fi
done

if [[ -n "$existing_page" ]]; then
  echo "Webbsidan körs, men API-servern svarar inte. Startar API-servern..."
  ensure_node_runtime
  npm run dev:server &
  api_pid=$!
  for _ in {1..20}; do
    if curl -fsS --max-time 1 http://127.0.0.1:4173/api/status 2>/dev/null | grep -Fq '"driveConfigured"'; then
      open_page "$existing_page"
      wait "$api_pid"
      exit $?
    fi
    if ! kill -0 "$api_pid" 2>/dev/null; then
      wait "$api_pid"
      exit $?
    fi
    sleep 1
  done
  echo "API-servern startade inte inom 20 sekunder." >&2
  kill "$api_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  exit 1
fi

if curl -fsS --max-time 1 http://127.0.0.1:4173/ 2>/dev/null | grep -Fq '<title>Matrik</title>'; then
  open_page http://127.0.0.1:4173/
  exit 0
fi

ensure_node_runtime

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
