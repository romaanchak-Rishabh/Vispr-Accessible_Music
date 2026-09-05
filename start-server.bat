@echo off
echo.
echo  ================================
echo   Vispr Local Server + Tunnel
echo  ================================
echo.

REM Download cloudflared if missing
if not exist "cloudflared.exe" (
    echo  Downloading cloudflared...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
)

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

REM Start Cloudflare tunnel in background
echo  Starting Cloudflare tunnel...
start /b cloudflared.exe tunnel --url http://localhost:8080 --no-autoupdate

REM Wait for tunnel URL to appear
echo  Waiting for tunnel URL...
set TUNNEL_URL=
set WAIT=0
set TMPURL=%TEMP%\vispr-tunnel-url.txt

:wait_loop
if %WAIT% gtr 45 (
    echo  Timed out waiting for tunnel. Check cloudflared.
    goto :run
)

REM Try the local metrics API
powershell -NoProfile -Command "try { $h = (Invoke-RestMethod -Uri 'http://127.0.0.1:20241/quicktunnel' -TimeoutSec 2).hostname; if ($h -match '^[a-z0-9-]+\.trycloudflare\.com$') { [System.IO.File]::WriteAllText('%TMPURL%', 'https://' + $h) } } catch {}" 2>nul

if exist "%TMPURL%" (
    set /p TUNNEL_URL=<"%TMPURL%"
    del "%TMPURL%" 2>nul
    if defined TUNNEL_URL goto :publish
)

REM Fallback: scan cloudflared logs
powershell -NoProfile -Command "$logs = @('$env:TEMP\opencode\cf-managed.err.log'); foreach ($l in $logs) { if (Test-Path $l) { $t = Get-Content $l -Raw -ErrorAction SilentlyContinue; if ($t -match 'https://[a-z0-9-]+\.trycloudflare\.com') { [System.IO.File]::WriteAllText('"%TMPURL%"', $Matches[0]); break } } }" 2>nul

if exist "%TMPURL%" (
    set /p TUNNEL_URL=<"%TMPURL%"
    del "%TMPURL%" 2>nul
    if defined TUNNEL_URL goto :publish
)

set /a WAIT+=2
timeout /t 2 /nobreak >nul
goto :wait_loop

:publish
echo.
echo  Tunnel URL: %TUNNEL_URL%
echo  Publishing to GitHub...

REM Write tunnel.txt without BOM and git push
powershell -NoProfile -Command "[System.IO.File]::WriteAllText('tunnel.txt', '%TUNNEL_URL%', (New-Object System.Text.UTF8Encoding $false))"
git add tunnel.txt 2>nul
git commit -m "Update tunnel url to %TUNNEL_URL%" 2>nul
git pull --rebase --autostash -q 2>nul
git push -q 2>nul

echo  Tunnel published to GitHub.
echo.

:run
echo  Server running on http://localhost:8080
echo  Tunnel: %TUNNEL_URL%
echo.
echo  Press Ctrl+C to stop.
pause >nul
