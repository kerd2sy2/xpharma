@echo off
chcp 65001 > nul
title XPharma Sync Agent - إيقاف
echo ==========================================================
echo       وكيل مزامنة المستودع - إيقاف البرنامج
echo ==========================================================
echo.
taskkill /F /IM xpharma-agent.exe > nul 2>&1
echo [تم] تم إيقاف وكيل المزامنة بنجاح.
timeout /t 2 > nul
