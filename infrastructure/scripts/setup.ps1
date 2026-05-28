# HumanHands development environment setup script (Windows/PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "`n=== HumanHands Setup ===" -ForegroundColor Cyan

# Node version check
$nodeVersion = (node --version 2>$null)
if (-not $nodeVersion) {
  Write-Error "Node.js not found. Install Node.js >= 20 from https://nodejs.org"
  exit 1
}
Write-Host "Node.js: $nodeVersion" -ForegroundColor Green

# pnpm check
$pnpmVersion = (pnpm --version 2>$null)
if (-not $pnpmVersion) {
  Write-Host "Installing pnpm..." -ForegroundColor Yellow
  npm install -g pnpm@9
}
Write-Host "pnpm: $(pnpm --version)" -ForegroundColor Green

# Install dependencies
Write-Host "`nInstalling workspace dependencies..." -ForegroundColor Yellow
pnpm install

# Build packages
Write-Host "`nBuilding shared packages..." -ForegroundColor Yellow
pnpm --filter="./packages/*" build

# Install Playwright browsers
Write-Host "`nInstalling Playwright browsers..." -ForegroundColor Yellow
pnpm --filter=@humanhands/executor exec playwright install chromium

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host @"

Next steps:
  pnpm dev                 - Start all services in parallel
  pnpm --filter=@humanhands/api dev          - Start API only
  pnpm --filter=@humanhands/extension dev    - Start extension in watch mode

Extension loading (Chrome):
  1. Go to chrome://extensions
  2. Enable Developer mode
  3. Click 'Load unpacked'
  4. Select: apps/extension/.plasmo/chrome-mv3-dev

API runs on: http://localhost:3000
Health check: http://localhost:3000/health

"@
