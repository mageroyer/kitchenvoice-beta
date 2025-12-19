@echo off
REM Kitchen Recipe Manager - Windows Launcher
REM Double-click this file to start the server

echo ========================================
echo Kitchen Recipe Manager - Starting...
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed!
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    pause
    exit /b 1
)

echo Python found! Starting server...
echo.

REM Start the Python server
python start_server.py

pause
