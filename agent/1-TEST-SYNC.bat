@echo off
chcp 65001 > nul
title XPharma Sync - Immediate Test
echo ==========================================================
echo       XPharma Warehouse Sync - Immediate Test
echo       فحص ومزامنة البيانات الفورية
echo ==========================================================
echo.
xpharma-agent.exe -sync-now
echo.
pause
