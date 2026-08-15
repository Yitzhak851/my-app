@echo off
REM Start both Flask backend and React frontend

echo Starting Social Network Application...
echo.
echo Make sure you have run: npm run install-all
echo.

cd backend

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Python is not installed or not in PATH.
    exit /b 1
)

REM Activate virtual environment
if exist venv (
    call venv\Scripts\activate.bat
)

REM Start backend in a new window
echo Starting Flask backend on http://localhost:5000...
start "YBO App - Backend" cmd /k python run.py

cd ..

REM Start frontend in a new window
echo Starting React frontend on http://localhost:5173...
cd frontend
start "YBO App - Frontend" cmd /k npm run dev
cd ..

echo.
echo Both applications started!
echo - Backend: http://localhost:5000
echo - Frontend: http://localhost:5173
echo.
echo Press Ctrl+C in each window to stop the applications.
pause
