@echo off
title SmartCookBook Deployment
cd /d "%~dp0"

echo.
echo ============================================================
echo   SmartCookBook - Cloud Deployment
echo ============================================================
echo.
echo   1. Deploy Frontend only (quick)
echo   2. Deploy Backend APIs (Cloud Run)
echo   3. Deploy Everything (Full deploy)
echo   4. Deploy Firestore Rules only
echo.
set /p mode="Select option (1-4): "

if "%mode%"=="1" goto frontend
if "%mode%"=="2" goto backend
if "%mode%"=="3" goto full
if "%mode%"=="4" goto rules
goto end

:frontend
echo.
echo [1/2] Building frontend...
cd app-new
call npm run build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] Deploying to Firebase Hosting...
call firebase deploy --only hosting

echo.
echo ============================================================
echo   Frontend deployed!
echo   URL: https://smartcookbook-2afe2.web.app
echo ============================================================
goto end

:backend
echo.
echo [1/2] Deploying Speech API to Cloud Run...
cd backend
call gcloud run deploy speech-api --source . --region us-central1 --allow-unauthenticated --memory 512Mi --timeout 60
cd ..

echo.
echo [2/2] Deploying Claude Proxy to Cloud Run...
cd app-new
copy /Y Dockerfile.proxy Dockerfile >nul
call gcloud run deploy claude-proxy --source . --region us-central1 --allow-unauthenticated --memory 256Mi --timeout 60
cd ..

echo.
echo ============================================================
echo   Backend APIs deployed!
echo ============================================================
goto end

:full
echo.
echo [1/5] Deploying Firestore Rules...
call firebase deploy --only firestore:rules

echo.
echo [2/5] Deploying Speech API to Cloud Run...
cd backend
call gcloud run deploy speech-api --source . --region us-central1 --allow-unauthenticated --memory 512Mi --timeout 60
cd ..

echo.
echo [3/5] Deploying Claude Proxy to Cloud Run...
cd app-new
copy /Y Dockerfile.proxy Dockerfile >nul
call gcloud run deploy claude-proxy --source . --region us-central1 --allow-unauthenticated --memory 256Mi --timeout 60

echo.
echo [4/5] Building frontend...
call npm run build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [5/5] Deploying to Firebase Hosting...
call firebase deploy --only hosting

echo.
echo ============================================================
echo   Full deployment complete!
echo   URL: https://smartcookbook-2afe2.web.app
echo ============================================================
goto end

:rules
echo.
echo Deploying Firestore Rules...
call firebase deploy --only firestore:rules

echo.
echo ============================================================
echo   Firestore rules deployed!
echo ============================================================
goto end

:end
echo.
pause
