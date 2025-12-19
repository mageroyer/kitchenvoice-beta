@echo off
echo ============================================================
echo   SmartCookBook - Stopping All Servers
echo ============================================================
echo.

REM Kill all Node.js processes related to SmartCookBook
echo Stopping all servers...

REM Kill by port numbers
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do taskkill /F /PID %%a 2>nul

REM Also kill any remaining node processes from our directories
taskkill /F /FI "WINDOWTITLE eq SmartCookBook*" 2>nul

echo.
echo ============================================================
echo   All servers stopped!
echo ============================================================
echo.
pause
