@echo off
cd /d "%~dp0"

if not exist "server.js" (
  echo.
  echo  Nie widze pliku server.js obok start.bat.
  echo  Najczesciej oznacza to, ze start.bat zostal uruchomiony prosto z archiwum zip.
  echo.
  echo  Co zrobic:
  echo   1. Wypakuj CALE archiwum do zwyklego folderu, np. na Pulpit.
  echo   2. Uruchom start.bat z wypakowanego folderu.
  echo.
  echo  Najprosciej bez pobierania: https://natanielbuko-droid.github.io/radar-traderow/
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Na tym komputerze nie ma programu Node.js, ktory jest potrzebny do wersji lokalnej.
  echo  Pobierz go ze strony https://nodejs.org ^(wersja LTS^) albo uzyj wersji w przegladarce:
  echo  https://natanielbuko-droid.github.io/radar-traderow/
  echo.
  pause
  exit /b 1
)

start "" http://localhost:8791
node server.js
pause
