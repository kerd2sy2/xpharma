@echo off
chcp 65001 > nul
title XPharma - Search Customer
echo ==========================================================
echo        Search Customer Details in ORGA SOFT
echo        البحث عن اسم وبيانات عميل أو صيدلية
echo ==========================================================
echo.
set /p acc_id="Enter Customer Code [Default: 2877]: "
if "%acc_id%"=="" set acc_id=2877
echo.
xpharma-agent.exe -account %acc_id%
echo.
pause
