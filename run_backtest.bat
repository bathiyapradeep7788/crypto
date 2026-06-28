@echo off
title AlgoBot Local Runner
color 0A
echo.
echo  =========================================
echo   AlgoBot Chrome-Automated Backtester
echo  =========================================
echo.

:: Change to script directory
cd /d "%~dp0"

:: Default dates — edit these before running
set START=2024-01-01
set END=2024-06-01
set INTERVAL=15m

echo  Start    : %START%
echo  End      : %END%
echo  Interval : %INTERVAL%
echo.
echo  Press any key to start (or Ctrl+C to cancel)...
pause > nul

echo.
echo  Launching Chrome automation...
echo.

venv\Scripts\python local_runner.py %START% %END% %INTERVAL%

echo.
if %errorlevel% == 0 (
    echo  SUCCESS! All coins processed and saved to database.
) else (
    echo  ERROR: Script exited with code %errorlevel%
    echo  Check the output above for details.
)
echo.
pause
