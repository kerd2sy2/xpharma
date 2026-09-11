@echo off
title XPharma Sync Dashboard
echo Starting XPharma Warehouse Sync Agent...
start http://localhost:8080
xpharma-agent.exe
