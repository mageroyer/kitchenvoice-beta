@echo off
title Autopilot Command Center
cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Launch Electron app
echo Starting Autopilot Command Center...
npx electron .
