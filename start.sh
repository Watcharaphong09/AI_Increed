#!/bin/bash
# AI Dev Workspace — Startup Script (Linux/macOS)
set -e

echo "======================================"
echo "  AI Dev Workspace - Starting..."
echo "======================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 not found. Please install Python 3.11+"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js 20+"
    exit 1
fi

# Create .env if not exists
if [ ! -f .env ]; then
    echo "[INFO] Creating .env from .env.example..."
    cp .env.example .env
    echo "[WARN] Please edit .env and add your AI API Key."
    echo "[WARN] Then run this script again."
    exit 1
fi

# Create and activate virtual environment
if [ ! -d "backend/venv" ]; then
    echo "[INFO] Creating Python virtual environment..."
    python3 -m venv backend/venv
fi

echo "[INFO] Installing backend dependencies..."
source backend/venv/bin/activate
pip install -r backend/requirements.txt -q

# Install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "[INFO] Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

echo ""
echo "[INFO] Starting Backend on http://127.0.0.1:8000"
echo "[INFO] Starting Frontend on http://localhost:3000"
echo ""

# Start backend
source backend/venv/bin/activate
cd backend && uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Wait for backend
sleep 3

# Start frontend
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "======================================"
echo "  AI Dev Workspace is running!"
echo "  http://localhost:3000"
echo "======================================"
echo ""
echo "Press Ctrl+C to stop all services."

# Handle shutdown
trap "kill $BACKEND_PID $FRONTEND_PID; exit 0" INT TERM
wait
