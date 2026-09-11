@echo off
chcp 65001 > nul
title XPharma Sync - Stop
echo ==========================================================
echo       XPharma Warehouse Sync - Stop
echo       إيقاف برنامج المزامنة
echo ==========================================================
echo.
taskkill /F /IM xpharma-agent.exe > nul 2>&1
echo [OK] Stopped successfully.
echo [تم] تم إيقاف البرنامج بنجاح.
timeout /t 3 > nul
