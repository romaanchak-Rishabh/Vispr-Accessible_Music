@echo off
REM Watch the tunnel: auto-restart backend/cloudflared and publish the fresh URL.
echo Starting tunnel watcher (closing this window stops it)...
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0watch-tunnel.ps1"
pause