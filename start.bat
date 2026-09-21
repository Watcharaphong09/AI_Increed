@echo off
title AI Dev Workspace
echo ======================================
echo   AI Dev Workspace - Starting...
echo ======================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.11+
    pause
    exit /b 1
)

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 20+
    pause
    exit /b 1
)

REM Create .env if not exists
if not exist .env (
    echo [INFO] Creating .env from .env.example...
    copy .env.example .env
    echo [WARN] Please edit .env and add your AI API Key before continuing.
    echo [WARN] Opening .env for editing...
    notepad .env
    pause
)

REM Check if Python already has required backend packages
python -c "import fastapi, uvicorn, pydantic, sqlalchemy, aiosqlite, openai" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing backend dependencies...
    pip install -r backend\requirements.txt
) else (
    echo [INFO] Backend dependencies are verified and ready.
)

REM Install frontend dependencies if needed
if not exist frontend\node_modules (
    echo [INFO] Installing frontend dependencies...
    cd /d "%~dp0frontend"
    call npm install
    cd /d "%~dp0"
)

echo.
echo [INFO] Starting Backend on http://127.0.0.1:8000
echo [INFO] Starting Frontend on http://localhost:3000
echo.
echo Press Ctrl+C to stop all services.
echo.

REM Start backend in new window
start "AI Workspace - Backend" cmd /k "cd /d "%~dp0" && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
start "AI Workspace - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM Open browser
timeout /t 4 /nobreak >nul
start http://localhost:3000

echo.
echo ======================================
echo   AI Dev Workspace is running!
echo   http://localhost:3000
echo ======================================
echo.
pause
