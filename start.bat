@echo off
title AI Dev Workspace
cd /d "%~dp0"

python run.py
if errorlevel 1 (
    echo.
    echo [!] Process ended.
    pause
)
