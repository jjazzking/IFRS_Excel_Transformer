@echo off
chcp 65001 >nul
rem 파이썬을 찾아 `실행.py` 를 띄운다. 두 번 눌러서 쓰는 사람을 위한 것이고,
rem 하는 일은 `python 실행.py` 와 똑같다.
cd /d "%~dp0"

where py >nul 2>nul && (py -3 "실행.py" & goto :eof)
where python >nul 2>nul && (python "실행.py" & goto :eof)
where python3 >nul 2>nul && (python3 "실행.py" & goto :eof)

echo.
echo   파이썬을 찾지 못했습니다.
echo.
echo   명령 프롬프트에서 python --version 이 되는지 확인해 주세요.
echo   되는데도 이 창이 뜬다면, 그 창에서 아래를 직접 실행하면 됩니다.
echo.
echo     cd /d "%~dp0"
echo     python 실행.py
echo.
pause
