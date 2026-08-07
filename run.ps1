$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
Write-Host "Starting Draft Room at http://127.0.0.1:4173" -ForegroundColor Green
node server.js
