@echo off
chcp 65001 > nul
title XPharma Sync - Continuous Sync
echo ==========================================================
echo       XPharma Warehouse Sync - Continuous Sync (Every 60s)
echo       تشغيل المزامنة المستمرة كل دقيقة
echo ==========================================================
echo.
xpharma-agent.exe
echo.
pause
