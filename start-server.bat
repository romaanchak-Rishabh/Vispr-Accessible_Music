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

REM Clean restart: stop whatever is holding :8080 and any previous cloudflared
echo  Stopping previous instances...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8080 "') do taskkill /F /PID %%p >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

REM Find local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set LOCAL_IP=%%a
    goto :found
)
:found
set LOCAL_IP=%LOCAL_IP: =%
echo  Local IP: %LOCAL_IP%
echo.

REM Find Python (owner's known path first, then PATH, then the py launcher)
set "PY=C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "%PY%" (
    set "PY="
    for /f "delims=" %%i in ('where python.exe 2^>nul') do (
        if not defined PY (
            "%%i" -c "import sys" >nul 2>&1 && set "PY=%%i"
        )
    )
)
if not defined PY (
    for /f "delims=" %%i in ('py.exe -3 -c "import sys; print(sys.executable)" 2^>nul') do (
        if not defined PY set "PY=%%i"
    )
)
if not defined PY (
    echo  Python not found.
    echo  Install Python 3.12 from https://www.python.org/downloads/
    echo  and TICK "Add python.exe to PATH" in the installer.
    pause
    exit /b 1
)
echo  Python: %PY%
echo.

REM First run: install server dependencies if missing
"%PY%" -c "import yt_dlp" >nul 2>&1
if errorlevel 1 (
    echo  Installing server dependencies - first run, one time...
    "%PY%" -m pip install -r server\requirements.txt -q
    "%PY%" -c "import yt_dlp" >nul 2>&1
    if errorlevel 1 (
        echo  Dependency install failed. Check your internet and re-run.
        pause
        exit /b 1
    )
)

REM Start Python backend in background
echo  Starting yt-dlp backend on :8080...
start /b "" "%PY%" server\app.py
timeout /t 2 /nobreak >nul

REM Start Cloudflare tunnel in background.
REM --protocol http2: QUIC silently dies on this network (28k control-stream
REM failures observed) leaving a "running" tunnel that never serves traffic.
if not exist "%TEMP%\opencode" mkdir "%TEMP%\opencode"
del "%TEMP%\opencode\cf-bat.err.log" 2>nul
echo  Starting Cloudflare tunnel (protocol: http2)...
start /b cloudflared.exe tunnel --url http://localhost:8080 --no-autoupdate --protocol http2 2>>"%TEMP%\opencode\cf-bat.err.log"

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
    if defined TUNNEL_URL goto :verify
)

REM Fallback: scan cloudflared logs
powershell -NoProfile -Command "$logs = @('$env:TEMP\opencode\cf-managed.err.log', '$env:TEMP\opencode\cf-bat.err.log'); foreach ($l in $logs) { if (Test-Path $l) { $t = Get-Content $l -Raw -ErrorAction SilentlyContinue; if ($t -match 'https://[a-z0-9-]+\.trycloudflare\.com') { [System.IO.File]::WriteAllText('"%TMPURL%"', $Matches[0]); break } } }" 2>nul

if exist "%TMPURL%" (
    set /p TUNNEL_URL=<"%TMPURL%"
    del "%TMPURL%" 2>nul
    if defined TUNNEL_URL goto :verify
)

set /a WAIT+=2
timeout /t 2 /nobreak >nul
goto :wait_loop

REM Verify the hostname answers publicly BEFORE publishing. Fresh quick-tunnel
REM hostnames need 1-3 min for DNS; publishing early bricks every connected app.
:verify
echo  Tunnel acquired: %TUNNEL_URL%
echo  Verifying it is publicly reachable (fresh hostnames need 1-3 min DNS)...
set VWAIT=0
set CODE=000
where curl.exe >nul 2>&1
if errorlevel 1 (set HAVE_CURL=0) else (set HAVE_CURL=1)

:verify_loop
if %VWAIT% gtr 180 goto :publish_anyway

if "%HAVE_CURL%"=="1" (
    curl.exe -s -o NUL --connect-timeout 5 --max-time 12 -w "%%{http_code}" "%TUNNEL_URL%/api/ping" > "%TEMP%\vispr-code.txt" 2>nul
    set CODE=000
    if exist "%TEMP%\vispr-code.txt" set /p CODE=<"%TEMP%\vispr-code.txt"
) else (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%TUNNEL_URL%/api/ping' -TimeoutSec 12 -UseBasicParsing; if ($r.StatusCode -eq 200) { '200' } else { $r.StatusCode } } catch { '000' }" > "%TEMP%\vispr-code.txt" 2>nul
    set CODE=000
    if exist "%TEMP%\vispr-code.txt" set /p CODE=<"%TEMP%\vispr-code.txt"
)

if "%CODE%"=="200" goto :publish

set /a MOD=VWAIT %% 15
if %MOD%==0 echo    not reachable yet - HTTP %CODE%, waited %VWAIT%s...
set /a VWAIT+=3
timeout /t 3 /nobreak >nul
goto :verify_loop

:publish_anyway
echo.
echo  WARNING: tunnel still unreachable after %VWAIT%s (HTTP %CODE%).
echo  Publishing anyway so clients can pick it up once DNS catches up.
echo.

:publish
echo.
echo  Tunnel URL: %TUNNEL_URL% (reachable check: HTTP %CODE%)

REM Publish only when this is a real git checkout with push access
REM (a downloaded ZIP or a clone without credentials just skips this).
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo  Not a git checkout - skipping URL publish.
    goto :run
)

echo  Publishing to GitHub...
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
echo  Running your OWN copy? Open the Vispr app - Settings - Import,
echo  paste the Tunnel URL above into "yt-dlp server URL".
echo  (See MULTI-USER-SETUP.txt for the full friend/multi-user guide.)
echo.
echo  Press Ctrl+C to stop.
pause >nul
