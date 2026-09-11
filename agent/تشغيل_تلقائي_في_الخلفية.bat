@echo off
chcp 65001 > nul
title XPharma Sync Agent - تشغيل في الخلفية
echo ==========================================================
echo       وكيل مزامنة المستودع - تشغيل في الخلفية 24 ساعة
echo ==========================================================
echo.
powershell -Command "Start-Process -FilePath (Get-Command cmd).Source -ArgumentList '/c', 'xpharma-agent.exe >> agent.log 2>&1' -WindowStyle Hidden"
echo [تم] تم تشغيل برنامج المزامنة بنجاح في الخلفية!
echo سيعمل البرنامج على مزامنة البيانات تلقائياً كل دقيقة.
echo يمكنك متابعة تقارير المزامنة في ملف: agent.log
timeout /t 3 > nul
