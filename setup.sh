#!/usr/bin/env bash
set -e

echo "==================================================="
echo "[VideoMAE Annotation Studio] Setup Environment"
echo "==================================================="

echo "[1/3] Checking Node.js..."
node -v || { echo "Node.js is not installed. Please install Node.js 18+."; exit 1; }

echo "[2/3] Setting up Python virtual environment (.venv)..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv || { echo "Failed to create .venv. Please install python3-venv."; exit 1; }
fi

./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/pip install -r scripts/requirements.txt

echo "[3/3] Installing Node.js dependencies..."
npm install

echo "==================================================="
echo "[SUCCESS] Setup complete! Run with: ./start.sh"
echo "==================================================="
