@echo off
REM ============================================================
REM  Medina Mesh - install all 3 MCP servers into all 5 clients
REM  Double-click this file, or run from any shell.
REM ============================================================

setlocal
cd /d "%~dp0"

echo.
echo === Medina Mesh installer ===
echo.

REM Check Node is on PATH
where node >nul 2>&1
if errorlevel 1 (
  echo [error] Node.js is not on your PATH.
  echo Install Node 20+ from https://nodejs.org and re-run this file.
  pause
  exit /b 1
)

REM Step 1: run all smokes so we know everything passes before wiring
echo --- gate: running all smoke tests ---
node tools\ship-all.mjs
if errorlevel 1 (
  echo.
  echo [error] One or more smokes failed. Not installing.
  pause
  exit /b 1
)

REM Step 2: install into every MCP client (dry-run first so user sees what changes)
echo.
echo --- preview of what will change ---
node tools\install-all.mjs --dry-run

echo.
choice /C YN /M "Apply these changes to all MCP clients on this machine"
if errorlevel 2 (
  echo Skipped. Nothing was changed.
  pause
  exit /b 0
)

echo.
echo --- writing configs ---
node tools\install-all.mjs

echo.
echo --- done ---
echo Restart Claude Desktop, Cursor, Cline, Continue, Zed to load the vault.
echo Open the dashboard: http://localhost:8731 (run dashboard.cmd to start it)
echo.
pause
