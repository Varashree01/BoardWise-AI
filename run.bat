@echo off
echo ========================================================
echo   BoardWise AI - Starting Hackathon MVP System
echo ========================================================

echo [1/2] Starting Python Flask Backend on port 5000...
start "BoardWise AI - Backend" cmd /k "cd backend && python app.py"

echo [2/2] Starting Vite Frontend on port 5173...
start "BoardWise AI - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================================
echo   Services launched!
echo   Frontend: http://localhost:5173
echo   Backend:  http://127.0.0.1:5000
echo ========================================================
pause
