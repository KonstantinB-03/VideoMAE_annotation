@echo off
chcp 65001 >nul
echo ===================================================
echo [VideoMAE Annotation Studio] Запуск сервера...
echo Откройте в браузере: http://localhost:3000
echo ===================================================
call npm run dev
pause
