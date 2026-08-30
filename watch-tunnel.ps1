param(
  [string]$Root = "C:\Users\user\Desktop\opencode\apple-music-clone",
  [int]$IntervalSec = 30,
  [string]$RecycleMin = 10,
  [switch]$Once
)

$ErrorActionPreference = 'SilentlyContinue'
$LogTimestamp = { Get-Date -Format "yyyy-MM-dd HH:mm:ss" }

$CfExe       = Join-Path $Root "cloudflared.exe"
$Python      = "C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe"
$TunnelFile  = Join-Path $Root "tunnel.txt"
$CfLog       = Join-Path $env:TEMP "opencode\cf-managed.log"
$BackendOut  = Join-Path $env:TEMP "opencode\backend.log"
$BackendErr  = Join-Path $env:TEMP "opencode\backend.err.log"
$ConfigFile  = Join-Path $Root "tunnel-config.json"
$NodeScript  = Join-Path $Root "whatsapp-notify.cjs"
$TgScript    = Join-Path $Root "telegram-notify.cjs"
$WatcherLog  = Join-Path $Root "watch-tunnel.log"

function Log($msg) {
  $line = ("[{0}] {1}" -f (& $LogTimestamp), $msg)
  Write-Host $line
  Add-Content -Path $WatcherLog -Value $line -Encoding UTF8
}

function Read-Url {
  if (Test-Path $TunnelFile) { (Get-Content $TunnelFile -Raw -ErrorAction SilentlyContinue).Trim() } else { '' }
}

# Classify what a probe of the public URL tells us:
#   ok   -> /api/ping answered 200
#   dns  -> hostname does not resolve yet (normal for fresh quick tunnels for a few minutes)
#   http -> hostname resolves but the request failed/timed out (edge or backend problem)
function Test-UrlState([string]$u) {
  if (-not $u) { return 'none' }
  try {
    $r = Invoke-WebRequest -Uri "$u/api/ping" -TimeoutSec 12 -UseBasicParsing
    return $(if ($r.StatusCode -eq 200) { 'ok' } else { 'http' })
  } catch {
    if ($_.Exception.Message -match 'remote name|name could not be resolved|could not be resolved|no such host|resolve') { return 'dns' }
    if ($_.Exception -is [System.Net.WebException] -and $_.Exception.Status -eq [System.Net.WebExceptionStatus]::NameResolutionFailure) { return 'dns' }
    return 'http'
  }
}

function Test-LocalBackend {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:8080/api/ping" -TimeoutSec 4 -UseBasicParsing
    return $r.StatusCode -eq 200
  } catch { return $false }
}

function Start-Backend {
  Log "Starting yt-dlp backend..."
  Remove-Item $BackendOut, $BackendErr -ErrorAction SilentlyContinue
  Start-Process -FilePath $Python -ArgumentList "server\app.py" -WorkingDirectory $Root `
    -RedirectStandardOutput $BackendOut -RedirectStandardError $BackendErr -WindowStyle Hidden
  Start-Sleep 3
}

function Stop-Cloudflared {
  Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue
  Wait-Process -Name cloudflared -Timeout 10 -ErrorAction SilentlyContinue
  Start-Sleep 2
}

function Start-Cloudflared {
  Log "Starting cloudflared..."
  Remove-Item $CfLog, "$env:TEMP\opencode\cf-managed.err.log" -ErrorAction SilentlyContinue
  Start-Process -FilePath $CfExe -ArgumentList "tunnel","--url","http://localhost:8080","--no-autoupdate" `
    -WorkingDirectory $Root -RedirectStandardOutput $CfLog -RedirectStandardError "$env:TEMP\opencode\cf-managed.err.log" -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 2
    try {
      $q = (Invoke-RestMethod -Uri "http://127.0.0.1:20241/quicktunnel" -TimeoutSec 3).hostname
      if ($q -match '^[a-z0-9-]+\.trycloudflare\.com$') { return "https://$q" }
    } catch {}
    foreach ($log in @($CfLog, "$env:TEMP\opencode\cf-managed.err.log")) {
      if (Test-Path $log) {
        $txt = Get-Content $log -Raw -ErrorAction SilentlyContinue
        if ($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') { return $Matches[0] }
      }
    }
  }
  return $null
}

function Publish-Url([string]$u) {
  # Write WITHOUT a UTF-8 BOM - a BOM corrupts the URL for the app's fetch+URL() parse.
  [System.IO.File]::WriteAllText($TunnelFile, $u, (New-Object System.Text.UTF8Encoding $false))
  Push-Location $Root
  try {
    $dirty = git status --porcelain tunnel.txt
    if ($dirty) {
      git add tunnel.txt | Out-Null
      git commit -m "Update tunnel url to $u" | Out-Null
      git pull --rebase --autostash -q
      if ($LASTEXITCODE -ne 0) {
        Log "git rebase failed (exit $LASTEXITCODE) - will retry next change"
      } else {
        git push -q
        if ($LASTEXITCODE -eq 0) { Log "Published tunnel URL to git: $u" }
        else { Log "git push failed (exit $LASTEXITCODE) for $u" }
      }
    }
  } catch { Log "git publish failed: $_" }
  Pop-Location
}

function Send-Notify([string]$u) {
  if (-not (Test-Path $ConfigFile)) { return }
  try {
    $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    if (-not $cfg) { return }
    $tg = $cfg.telegram
    if ($tg -and $tg.enabled -and $tg.botToken) {
      if (Get-Command node -ErrorAction SilentlyContinue) {
        Log "Notifying Telegram..."
        Start-Process -FilePath "node" -ArgumentList "`"$TgScript`" `"$u`"" -WorkingDirectory $Root `
          -RedirectStandardOutput "$env:TEMP\opencode\tg.log" -RedirectStandardError "$env:TEMP\opencode\tg.err.log" -WindowStyle Hidden
      }
      return
    }
    if ($cfg.whatsappEnabled -and $cfg.whatsappNumber) {
      if (Get-Command node -ErrorAction SilentlyContinue) {
        Log "Notifying WhatsApp..."
        Start-Process -FilePath "node" -ArgumentList "`"$NodeScript`" `"$u`"" -WorkingDirectory $Root `
          -RedirectStandardOutput "$env:TEMP\opencode\wa.log" -RedirectStandardError "$env:TEMP\opencode\wa.err.log" -WindowStyle Hidden
      }
    }
  } catch { Log "notify skip: $_" }
}

$url = Read-Url
if (-not $url) { $url = 'https://views-whale-forget-means.trycloudflare.com' }
$candidate = ''
$candidateSince = $null
Log "Watching tunnel. Current: $url"

do {
  if (-not (Test-LocalBackend)) {
    Start-Backend
    Start-Sleep 2
  }

  # We hold an acquired-but-unverified tunnel. Keep waiting on the SAME hostname -
  # fresh quick-tunnel hostnames take up to a few minutes to get public DNS - and
  # only publish/notify once it actually answers. Recycle only as a last resort.
  if ($candidate) {
    $st = Test-UrlState $candidate
    if ($st -eq 'ok') {
      Log "$candidate is now reachable - publishing."
      Publish-Url $candidate
      Send-Notify $candidate
      $url = $candidate
      $candidate = ''
      $candidateSince = $null
      Log "OK - backend + tunnel healthy ($url)"
    } else {
      $elapsed = $(if ($candidateSince) { (Get-Date) - $candidateSince } else { [TimeSpan]::Zero })
      $waited  = "$([math]::Floor($elapsed.TotalMinutes))m$($elapsed.Seconds.ToString('00'))s"
      if ($st -eq 'dns') {
        Log "candidate $candidate still resolving DNS (waited $waited) - keeping it."
      } else {
        Log "candidate $candidate not ready yet (edge/HTTP, waited $waited) - keeping it."
      }
      if ($elapsed.TotalMinutes -gt $RecycleMin) {
        Log "Candidate unreachable after $RecycleMin min - recycling for a fresh hostname."
        Stop-Cloudflared
        $candidate = ''
        $candidateSince = $null
      }
    }
    if ($Once) { break }
    Start-Sleep $IntervalSec
    continue
  }

  $ran = Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1

  if ($ran) {
    # Always query cloudflared metrics FIRST — the live URL may have changed
    $live = try { (Invoke-RestMethod -Uri "http://127.0.0.1:20241/quicktunnel" -TimeoutSec 3).hostname } catch { '' }

    if ($live -and "https://$live" -ne $url) {
      # Cloudflared has a different URL than what's published — switch immediately
      $candidate = "https://$live"
      $candidateSince = Get-Date
      Log "Cloudflared live on $candidate (published $url is stale) - verifying."
    } elseif ($live -and "https://$live" -eq $url) {
      # Same URL — just health-check it
      $st = Test-UrlState $url
      if ($st -ne 'ok') {
        if ($st -eq 'dns') {
          Log "Published URL $url DNS lag - checking if cloudflared rotated."
          # Re-query metrics in case it changed between checks
          $live2 = try { (Invoke-RestMethod -Uri "http://127.0.0.1:20241/quicktunnel" -TimeoutSec 3).hostname } catch { '' }
          if ($live2 -and "https://$live2" -ne $url) {
            $candidate = "https://$live2"
            $candidateSince = Get-Date
            Log "Cloudflared rotated to $candidate - verifying."
          }
        } else {
          Log "Tunnel URL down (edge/HTTP) - restarting cloudflared for a fresh hostname."
          Stop-Cloudflared
          $ran = $null
        }
      } else {
        Log "OK - backend + tunnel healthy ($url)"
      }
    } else {
      # process up but metrics unreachable — check if published URL is alive
      $st = Test-UrlState $url
      if ($st -ne 'ok' -and $st -ne 'dns') {
        Log "Tunnel URL down (edge/HTTP) - restarting cloudflared for a fresh hostname."
        Stop-Cloudflared
        $ran = $null
      }
    }
  }

  if (-not $ran) {
    $fresh = Start-Cloudflared
    if ($fresh) {
      $candidate = $fresh
      $candidateSince = Get-Date
      Log "Acquired fresh tunnel $fresh - verifying reachability before publishing."
    } else {
      Log "cloudflared failed to start within 45s - will retry."
    }
  }

  if ($Once) { break }
  Start-Sleep $IntervalSec
} while ($true)
