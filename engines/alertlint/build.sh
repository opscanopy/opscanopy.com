#!/usr/bin/env bash
# =============================================================================
#  AlertLint engine — POSIX build script (Phase 0 PoC).
#
#  Compiles main.go to WebAssembly and stages the two artifacts the web
#  playground needs into ../../public:
#
#    public/engine.wasm     <- the compiled Go program
#    public/wasm_exec.js    <- the Go runtime shim that hosts it
#
#  PREREQUISITE: Go 1.22+ must be installed and on PATH (`go version`).
#  Go is NOT installed in the environment this repo was scaffolded in, so
#  engine.wasm has not been built yet — run this script on a machine with Go.
# =============================================================================
set -euo pipefail

# Resolve paths relative to this script so it works from any CWD.
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$(cd "${ENGINE_DIR}/../.." && pwd)/public"

echo "[alertlint] Checking for the Go toolchain..."
if ! command -v go >/dev/null 2>&1; then
  echo "[alertlint] ERROR: Go was not found on PATH. Install Go 1.22+ from https://go.dev/dl/ and retry." >&2
  exit 1
fi
go version

mkdir -p "${PUBLIC_DIR}"

# --- 1. Build the WASM binary -----------------------------------------------
echo "[alertlint] Building engine.wasm (GOOS=js GOARCH=wasm)..."
( cd "${ENGINE_DIR}" && GOOS=js GOARCH=wasm go build -o "${PUBLIC_DIR}/engine.wasm" . )

# --- 2. Copy the runtime shim from the active Go toolchain ------------------
#  Go 1.24+ ships wasm_exec.js at  $(go env GOROOT)/lib/wasm/wasm_exec.js
#  Older toolchains ship it at     $(go env GOROOT)/misc/wasm/wasm_exec.js
GOROOT_DIR="$(go env GOROOT)"
WASM_EXEC="${GOROOT_DIR}/lib/wasm/wasm_exec.js"
if [ ! -f "${WASM_EXEC}" ]; then
  WASM_EXEC="${GOROOT_DIR}/misc/wasm/wasm_exec.js"
fi

if [ ! -f "${WASM_EXEC}" ]; then
  echo "[alertlint] ERROR: could not find wasm_exec.js under ${GOROOT_DIR}." >&2
  echo "[alertlint]        Looked in lib/wasm/ and misc/wasm/. Check your Go install." >&2
  exit 1
fi

echo "[alertlint] Copying wasm_exec.js from ${WASM_EXEC}..."
cp -f "${WASM_EXEC}" "${PUBLIC_DIR}/wasm_exec.js"

echo "[alertlint] Done. Staged:"
echo "[alertlint]   ${PUBLIC_DIR}/engine.wasm"
echo "[alertlint]   ${PUBLIC_DIR}/wasm_exec.js"
