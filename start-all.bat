@echo off
echo Starting SmartCookBook servers...
echo.

start "Backend Server" cmd /k "cd backend && node server.js"
start "Frontend App" cmd /k "cd app-new && npm run dev"

echo Both servers starting in separate windows.
echo.
echo Backend: https://localhost:3000
echo Frontend: http://localhost:5173
echo.
pause
