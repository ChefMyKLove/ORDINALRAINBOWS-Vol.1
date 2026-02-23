@echo off
echo Starting ORDINAL RAINBOWS development server...
echo.
echo Project will be available at: http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

cd /d "%~dp0"

REM Try Python 3 first
python -m http.server 8000 2>nul
if errorlevel 1 (
    REM Try Python 2 if Python 3 fails
    python -m SimpleHTTPServer 8000 2>nul
    if errorlevel 1 (
        echo ERROR: Python not found. Please install Python or open index.html directly in your browser.
        pause
    )
)