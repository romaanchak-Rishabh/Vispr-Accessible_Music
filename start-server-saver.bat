@echo off
echo.
echo  ====================================
echo   Vispr Server (Battery Optimized)
echo  ====================================
echo.

REM Apply power plan (never sleep, low CPU)
echo  Applying power-saving plan...
powershell -ExecutionPolicy Bypass -File "%~dp0setup-power-plan.ps1"
echo.

REM Start the managed tunnel watcher
echo  Starting tunnel watcher (backend + cloudflared)...
echo  This will auto-heal the tunnel every 30s.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0watch-tunnel.ps1"
