@echo off
:: Creates a Desktop shortcut for the Autopilot Command Center

set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\Autopilot Command Center.lnk"
set "VBS_PATH=%~dp0..\AutopilotCommandCenter.vbs"
set "ICON_PATH=%~dp0src\icon.ico"

:: Create the shortcut using PowerShell
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$s = $ws.CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath = 'wscript.exe';" ^
  "$s.Arguments = '\"%VBS_PATH%\"';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.Description = 'AI Autopilot Command Center - Agent Monitoring Dashboard';" ^
  "if (Test-Path '%ICON_PATH%') { $s.IconLocation = '%ICON_PATH%' };" ^
  "$s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo  Desktop shortcut created successfully!
    echo  Location: %SHORTCUT%
    echo.
) else (
    echo.
    echo  Failed to create shortcut. You can manually create one:
    echo  Right-click Desktop ^> New ^> Shortcut
    echo  Target: wscript.exe "%VBS_PATH%"
    echo.
)

pause
