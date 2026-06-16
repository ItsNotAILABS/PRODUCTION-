@echo off
REM Start the Medina dashboard at http://localhost:8731
REM Double-click this file. Leave the window open while you use the dashboard.
REM Close the window to stop the dashboard.

setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [error] Node.js is not on your PATH. Install Node 20+ from https://nodejs.org
  pause
  exit /b 1
)

echo Starting Medina dashboard...
echo.
echo Open http://localhost:8731 in your browser.
echo Press Ctrl+C or close this window to stop.
echo.

node products\medina-dashboard\src\server.mjs
pause
