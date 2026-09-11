@echo off
chcp 65001 > nul
title XPharma Sync - Background Service
echo ==========================================================
echo       XPharma Warehouse Sync - Background 24/7
echo       تشغيل البرنامج في الخلفية على مدار 24 ساعة
echo ==========================================================
echo.
powershell -Command "Start-Process -FilePath (Get-Command cmd).Source -ArgumentList '/c', 'xpharma-agent.exe -daemon >> agent.log 2>&1' -WindowStyle Hidden"
echo [OK] XPharma agent started in background!
echo [تم] تم تشغيل برنامج المزامنة بنجاح في الخلفية!
timeout /t 5 > nul
