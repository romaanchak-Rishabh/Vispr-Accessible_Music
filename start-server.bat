@echo off
echo.
echo  ================================
echo   Vispr Local Server + Tunnel
echo  ================================
echo.

REM Find local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set LOCAL_IP=%%a
    goto :found
)
:found
set LOCAL_IP=%LOCAL_IP: =%
echo  Local IP: %LOCAL_IP%
echo.

REM Start Python backend in background
echo  Starting yt-dlp backend on :8080...
start /b "C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe" server\app.py
timeout /t 2 /nobreak >nul

REM Start Cloudflare tunnel
echo  Starting Cloudflare tunnel...
echo  (Copy the https:// URL below into the app Settings)
echo.
cloudflared.exe tunnel --url http://localhost:8080

pause
