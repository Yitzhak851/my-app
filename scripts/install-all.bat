@echo off
REM Install all dependencies for the project
REM This script installs Node.js dependencies and Python dependencies

echo Installing dependencies...
echo.

echo Installing frontend dependencies...
cd frontend
call npm install
cd ..

echo.
echo Installing backend dependencies...
cd backend

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Python is not installed or not in PATH.
    echo Please install Python 3.9+ and try again.
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist venv (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install Python dependencies
echo Installing Python dependencies...
pip install -r requirements.txt

cd ..

echo.
echo All dependencies installed successfully!
echo.
echo Next steps:
echo 1. Run: npm run start-app
echo 2. Open http://localhost:5173 in your browser
pause
