@echo off
title Stop AI Dev Workspace
echo ==============================================
echo    Stopping AI Dev Workspace Services...
echo ==============================================

echo [*] Terminating Backend on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] Terminating Frontend on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] Cleaning up node and uvicorn processes...
taskkill /F /IM uvicorn.exe >nul 2>&1

echo.
echo ==============================================
echo   [OK] All services stopped successfully!
echo ==============================================
ping 127.0.0.1 -n 2 >nul
