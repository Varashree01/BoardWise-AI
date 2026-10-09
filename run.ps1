# BoardWise AI - PowerShell Launcher
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  BoardWise AI - Public Transit Agent Launcher" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green

Write-Host "`n[1/2] Starting Python Flask Backend on port 5000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; python app.py"

Write-Host "[2/2] Starting Vite Frontend on port 5173..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "`nBoardWise AI successfully launched!" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:  http://127.0.0.1:5000" -ForegroundColor White
