@echo off
title SmartCookBook Server Manager
cd /d "%~dp0"

echo.
echo ============================================================
echo   SmartCookBook - Server Manager
echo ============================================================
echo.
echo   1. Development (PC only - HTTP frontend)
echo   2. Tablet Mode (HTTPS everywhere - for tablet testing)
echo.
set /p mode="Select mode (1 or 2): "

if "%mode%"=="2" goto tablet
goto dev

:dev
echo.
echo Starting Development Mode...
node server-manager.js
goto end

:tablet
echo.
echo Starting Tablet Mode (HTTPS)...
echo.

REM Kill any existing processes on our ports
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak > nul

echo.
echo [1/4] Building frontend for production...
cd app-new
call npm run build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/4] Starting Speech API Server (port 3000)...
start "SmartCookBook Speech API" cmd /k "cd backend && npm start"
timeout /t 2 /nobreak > nul

echo.
echo [3/4] Starting Claude Proxy Server (port 3001)...
start "SmartCookBook Claude Proxy" cmd /k "cd app-new && node proxy-server.js"
timeout /t 2 /nobreak > nul

echo.
echo [4/4] Starting HTTPS Frontend Server (port 5000)...
start "SmartCookBook Frontend HTTPS" cmd /k "cd app-new && node https-server.js"

echo.
echo ============================================================
echo   All Servers Started (Tablet Mode)
echo ============================================================
echo.
echo   Speech API:    https://192.168.2.53:3000
echo   Claude Proxy:  https://192.168.2.53:3001
echo   Frontend:      https://192.168.2.53:5000
echo.
echo   On tablet, accept SSL warnings for all 3 URLs above,
echo   then open: https://192.168.2.53:5000
echo.
echo   To stop: Close all server windows or run stop.bat
echo ============================================================

:end
pause
