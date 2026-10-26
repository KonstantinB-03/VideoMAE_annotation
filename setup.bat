@echo off
chcp 65001 >nul
echo ===================================================
echo [VideoMAE Annotation Studio] Первоначальная настройка
echo ===================================================

echo [1/3] Проверка Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не установлен! Установите Node.js 18+ с https://nodejs.org/
    pause
    exit /b 1
)

echo [2/3] Создание виртуального окружения Python (.venv)...
if not exist .venv (
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ОШИБКА] Не удалось создать .venv! Проверьте, что Python 3.10+ установлен и добавлен в PATH.
        pause
        exit /b 1
    )
)

echo Установка зависимостей Python...
call .\.venv\Scripts\python.exe -m pip install --upgrade pip
call .\.venv\Scripts\pip.exe install -r scripts\requirements.txt
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сбой при установке Python зависимостей.
    pause
    exit /b 1
)

echo [3/3] Установка зависимостей Node.js...
call npm install
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сбой npm install.
    pause
    exit /b 1
)

echo ===================================================
echo [УСПЕХ] Установка завершена!
echo Запустите проект через start.bat или командой: npm run dev
echo ===================================================
pause
