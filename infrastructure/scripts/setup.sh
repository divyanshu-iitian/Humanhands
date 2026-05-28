#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "=== HumanHands Setup ==="

# Node check
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install Node.js >= 20 from https://nodejs.org"
  exit 1
fi
NODE_VERSION=$(node --version)
echo "Node.js: $NODE_VERSION"

# pnpm check
if ! command -v pnpm &>/dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm@9
fi
echo "pnpm: $(pnpm --version)"

# Install dependencies
echo ""
echo "Installing workspace dependencies..."
pnpm install

# Build packages
echo ""
echo "Building shared packages..."
pnpm --filter="./packages/*" build

# Playwright browsers
echo ""
echo "Installing Playwright browsers..."
pnpm --filter=@humanhands/executor exec playwright install chromium

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  pnpm dev                                  - Start all services"
echo "  pnpm --filter=@humanhands/api dev         - Start API only"
echo "  pnpm --filter=@humanhands/extension dev   - Start extension watch"
echo ""
echo "Extension loading (Chrome):"
echo "  1. chrome://extensions"
echo "  2. Enable Developer mode"
echo "  3. Load unpacked: apps/extension/.plasmo/chrome-mv3-dev"
echo ""
echo "API: http://localhost:3000"
echo "Health: http://localhost:3000/health"
