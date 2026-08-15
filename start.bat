@echo off
REM ============================================================================
REM  YBO Social Network - start everything (Windows)
REM
REM  Double-click this file, or run it from a terminal:   start.bat
REM
REM  It sets up anything missing, starts the API and the web app, and opens
REM  your browser. Safe to run repeatedly.
REM ============================================================================

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Node.js is not installed, or not on your PATH.
    echo   Install the LTS version from https://nodejs.org and run this again.
    echo.
    pause
    exit /b 1
)

node scripts/setup.mjs
if errorlevel 1 (
    echo.
    echo   Setup did not finish. Fix the problem reported above, then run this again.
    echo.
    pause
    exit /b 1
)

node scripts/dev.mjs

REM Keeps the window open if it was launched by double-clicking.
pause
