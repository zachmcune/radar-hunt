# Share Radar Hunt on your network and via a temporary public HTTPS link.
Set-Location $PSScriptRoot

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

$env:RADAR_HUNT_OPEN_BROWSER = "0"
$env:PYTHONUNBUFFERED = "1"

$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PSScriptRoot
    python serve.py 2>&1
}

Start-Sleep -Seconds 2
$serverOutput = Receive-Job $serverJob
$serverOutput | ForEach-Object { Write-Host $_ }

$port = 8080
if ($serverOutput -match "localhost:(\d+)") {
    $port = [int]$Matches[1]
}

Write-Host ""
Write-Host "  Starting public HTTPS tunnel..." -ForegroundColor Cyan
Write-Host "  (First visit may ask you to click Continue on a warning page.)" -ForegroundColor DarkGray
Write-Host ""

npx --yes localtunnel --port $port

Stop-Job $serverJob -ErrorAction SilentlyContinue
Remove-Job $serverJob -ErrorAction SilentlyContinue
