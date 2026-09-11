@echo off
chcp 65001 > nul
title XPharma - البحث عن بيانات عميل
echo ==========================================================
echo        البحث عن اسم وبيانات عميل في منظومة ORGA SOFT
echo ==========================================================
echo.
set /p acc_id="ادخل كود العميل المطلوب (مثال: 2877): "
if "%acc_id%"=="" set acc_id=2877
echo.
xpharma-agent.exe -account %acc_id%
echo.
pause
