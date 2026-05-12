@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this host.
  echo Install Node.js on the host device, or run this game from a device that already has Node.js.
  echo Other phones/tablets/computers only need a browser after this host starts the LAN service.
  pause
  exit /b 1
)
echo Starting Gomoku LAN service from:
echo %cd%
echo.
node server.js
pause
