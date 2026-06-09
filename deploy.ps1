# Deploy Radar Hunt to Surge (free permanent HTTPS hosting)
Set-Location $PSScriptRoot

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host ""
Write-Host "  Deploy Radar Hunt (permanent HTTPS URL)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Option A — Surge (command line)" -ForegroundColor Yellow
Write-Host "    First run asks for email + password to create a free account."
Write-Host ""
Write-Host "  Option B — Netlify Drop (no account needed)" -ForegroundColor Yellow
Write-Host "    1. Open https://app.netlify.com/drop"
Write-Host "    2. Drag this folder into the page"
Write-Host "    3. Use the URL Netlify gives you on any device"
Write-Host ""

$choice = Read-Host "Deploy with Surge now? (y/n)"
if ($choice -eq "y") {
    npx --yes surge . --domain radar-hunt-app.surge.sh
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  Live at: https://radar-hunt-app.surge.sh" -ForegroundColor Green
        Write-Host ""
    }
}
