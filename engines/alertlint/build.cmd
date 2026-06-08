@echo off
REM ============================================================================
REM  AlertLint engine — Windows build script (Phase 0 PoC).
REM
REM  Compiles main.go to WebAssembly and stages the two artifacts the web
REM  playground needs into ../../public:
REM
REM    public/engine.wasm     <- the compiled Go program
REM    public/wasm_exec.js    <- the Go runtime shim that hosts it
REM
REM  PREREQUISITE: Go 1.22+ must be installed and on PATH (`go version`).
REM  Go is NOT installed in the environment this repo was scaffolded in, so
REM  engine.wasm has not been built yet — run this script on a machine with Go.
REM ============================================================================

setlocal enabledelayedexpansion

REM Resolve paths relative to this script so it works from any CWD.
set "ENGINE_DIR=%~dp0"
set "PUBLIC_DIR=%ENGINE_DIR%..\..\public"

echo [alertlint] Checking for the Go toolchain...
where go >nul 2>nul
if errorlevel 1 (
  echo [alertlint] ERROR: Go was not found on PATH. Install Go 1.22+ from https://go.dev/dl/ and retry.
  exit /b 1
)
go version

REM --- 1. Build the WASM binary -------------------------------------------------
echo [alertlint] Building engine.wasm (GOOS=js GOARCH=wasm)...
pushd "%ENGINE_DIR%"
set "GOOS=js"
set "GOARCH=wasm"
go build -o "%PUBLIC_DIR%\engine.wasm" .
if errorlevel 1 (
  echo [alertlint] ERROR: go build failed. Fix the reported errors and retry.
  popd
  exit /b 1
)
popd

REM --- 2. Copy the runtime shim from the active Go toolchain -------------------
REM  Go 1.24+ ships wasm_exec.js at  %%GOROOT%%\lib\wasm\wasm_exec.js
REM  Older toolchains ship it at     %%GOROOT%%\misc\wasm\wasm_exec.js
for /f "delims=" %%G in ('go env GOROOT') do set "GOROOT_DIR=%%G"

set "WASM_EXEC=%GOROOT_DIR%\lib\wasm\wasm_exec.js"
if not exist "%WASM_EXEC%" set "WASM_EXEC=%GOROOT_DIR%\misc\wasm\wasm_exec.js"

if not exist "%WASM_EXEC%" (
  echo [alertlint] ERROR: could not find wasm_exec.js under "%GOROOT_DIR%".
  echo [alertlint]        Looked in lib\wasm\ and misc\wasm\. Check your Go install.
  exit /b 1
)

echo [alertlint] Copying wasm_exec.js from "%WASM_EXEC%"...
copy /Y "%WASM_EXEC%" "%PUBLIC_DIR%\wasm_exec.js" >nul
if errorlevel 1 (
  echo [alertlint] ERROR: failed to copy wasm_exec.js into public\.
  exit /b 1
)

echo [alertlint] Done. Staged:
echo [alertlint]   %PUBLIC_DIR%\engine.wasm
echo [alertlint]   %PUBLIC_DIR%\wasm_exec.js
endlocal
