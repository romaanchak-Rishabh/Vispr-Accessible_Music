# Vispr Server Power Plan — keeps backend alive on battery with minimal drain
# Run as Administrator

$planName = "Vispr Server (Battery Saver)"
$desc = "Disables sleep, lowers CPU/screen to extend battery while running Vispr backend"

# Duplicate the balanced scheme
$balGuid = (powercfg /getactivescheme).Split(' ')[0]
$newGuid = powercfg /duplicate $balGuid
powercfg /changename $newGuid $planName $desc

# Set as active
powercfg /setactive $newGuid

# === SLEEP ===
# Never sleep (0 = never)
powercfg /setacvalueindex $newGuid SUB_SLEEP STANDBYIDLE 0
powercfg /setdcvalueindex $newGuid SUB_SLEEP STANDBYIDLE 0

# Never hibernate
powercfg /setacvalueindex $newGuid SUB_SLEEP HIBERNATEIDLE 0
powercfg /setdcvalueindex $newGuid SUB_SLEEP HIBERNATEIDLE 0

# Disable hybrid sleep
powercfg /setacvalueindex $newGuid SUB_SLEEP HYBRIDSLEEP 0
powercfg /setdcvalueindex $newGuid SUB_SLEEP HYBRIDSLEEP 0

# === CPU ===
# Max CPU state 40% on battery (saves lots of power)
powercfg /setacvalueindex $newGuid SUB_PROCESSOR PROCTHROTTLEMAX 100
powercfg /setdcvalueindex $newGuid SUB_PROCESSOR PROCTHROTTLEMAX 40

# Min CPU state 5%
powercfg /setacvalueindex $newGuid SUB_PROCESSOR PROCTHROTTLEMIN 5
powercfg /setdcvalueindex $newGuid SUB_PROCESSOR PROCTHROTTLEMIN 5

# === DISPLAY ===
# Dim display after 1 minute on battery
powercfg /setacvalueindex $newGuid SUB_VIDEO VIDEOIDLE 60
powercfg /setdcvalueindex $newGuid SUB_VIDEO VIDEOIDLE 60

# Turn off display after 3 minutes on battery (backend still runs)
powercfg /setacvalueindex $newGuid SUB_VIDEO VIDEONDOWN 180
powercfg /setdcvalueindex $newGuid SUB_VIDEO VIDEONDOWN 180

# Display brightness battery: 30%
powercfg /setdcvalueindex $newGuid SUB_VIDEO VIDEOBRIGHTNESS 30

# === DISK ===
# Turn off hard disk after 5 minutes (saves power)
powercfg /setacvalueindex $newGuid SUB_DISK DISKIDLE 300
powercfg /setdcvalueindex $newGuid SUB_DISK DISKIDLE 300

# === WIRELESS ===
# Max performance on battery (keeps tunnel alive)
powercfg /setdcvalueindex $newGuid SUB_WIRELESS PROTOCOLMODE 1

# === USB ===
# USB selective suspend — disable (keeps cloudflared connection alive)
powercfg /setacvalueindex $newGuid 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
powercfg /setdcvalueindex $newGuid 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0

# === APPLY ===
powercfg /setactive $newGuid

Write-Host ""
Write-Host "  Vispr Server power plan activated!" -ForegroundColor Green
Write-Host "  - Never sleeps" -ForegroundColor Cyan
Write-Host "  - CPU capped at 40% on battery" -ForegroundColor Cyan
Write-Host "  - Display dims at 1min, off at 3min" -ForegroundColor Cyan
Write-Host "  - USB suspend disabled" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To switch back to Balanced:" -ForegroundColor Yellow
Write-Host "    powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e"
Write-Host ""
Write-Host "  To delete this plan:" -ForegroundColor Yellow
Write-Host "    powercfg /delete $newGuid"
Write-Host ""
