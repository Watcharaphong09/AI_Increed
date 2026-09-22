"""
Unified Runner for AI Dev Workspace (AI_Increed).
Starts both Backend (FastAPI/Uvicorn) and Frontend (Vite) in a single unified process.
Controls shutdown gracefully with Ctrl+C.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
FRONTEND_DIR = ROOT / "frontend"


def main():
    print("=" * 50)
    print("       AI Dev Workspace — Launcher")
    print("=" * 50)
    print()

    # Verify python dependencies
    try:
        import fastapi
        import uvicorn
    except ImportError:
        print("[!] Backend dependencies missing. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(ROOT / "backend" / "requirements.txt")], check=True)

    # 1. Start Backend
    print("[1/2] Starting Backend (FastAPI on http://127.0.0.1:8000)...")
    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        "--reload",
    ]

    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=str(ROOT),
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )

    # 2. Start Frontend
    print("[2/2] Starting Frontend (Vite on http://localhost:3000)...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(FRONTEND_DIR),
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )

    # 3. Wait and open browser
    time.sleep(2.5)
    print()
    print("=" * 50)
    print("  [OK] System is ready!")
    print("  URL: http://localhost:3000")
    print("  (Press Ctrl+C to stop all services)")
    print("=" * 50)
    print()

    try:
        webbrowser.open("http://localhost:3000")
    except Exception:
        pass

    def cleanup(signum=None, frame=None):
        print("\n[*] Stopping all services...")
        if sys.platform == "win32":
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(backend_proc.pid)], capture_output=True)
            except Exception:
                pass
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(frontend_proc.pid)], capture_output=True)
            except Exception:
                pass
        else:
            try:
                backend_proc.terminate()
                frontend_proc.terminate()
            except Exception:
                pass
        print("[✓] All services stopped cleanly.")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print(f"[!] Backend stopped with code {backend_proc.returncode}")
                cleanup()
            if frontend_proc.poll() is not None:
                print(f"[!] Frontend stopped with code {frontend_proc.returncode}")
                cleanup()
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
