@echo off
chcp 65001 > nul
title XPharma - تسجيل التشغيل التلقائي مع بدء تشغيل الويندوز
color 0A

echo.
echo ==================================================================
echo         XPharma Warehouse Sync Agent
echo         تسجيل التشغيل التلقائي مع بدء تشغيل الويندوز
echo ==================================================================
echo.
echo [!] هذا الملف يسجل برنامج المزامنة كمهمة تلقائية في Windows
echo     سيعمل البرنامج تلقائياً عند كل تشغيل للجهاز بدون أي تدخل
echo.

:: التحقق من وجود الملف التنفيذي
if not exist "%~dp0xpharma-agent.exe" (
    echo [خطا] لم يتم العثور على ملف xpharma-agent.exe في نفس المجلد!
    echo        تأكد من أن هذا الملف موجود مع xpharma-agent.exe في نفس المجلد.
    echo.
    pause
    exit /b 1
)

:: التحقق من وجود ملف الإعدادات
if not exist "%~dp0config.yaml" (
    echo [خطا] لم يتم العثور على ملف الإعدادات config.yaml
    echo        يرجى تشغيل البرنامج مرة أولى عبر ملف 1-TEST-SYNC.bat لإعداد البيانات.
    echo.
    pause
    exit /b 1
)

echo [1/3] جاري حذف أي تسجيل قديم للمهمة إن وجد...
schtasks /delete /tn "XPharma-Warehouse-Sync" /f > nul 2>&1

echo [2/3] جاري تسجيل مهمة التشغيل التلقائي في Windows Task Scheduler...
schtasks /create ^
  /tn "XPharma-Warehouse-Sync" ^
  /tr "\"%~dp0xpharma-agent.exe\" -daemon -no-prompt" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /f > nul 2>&1

if %errorlevel% neq 0 (
    :: محاولة بديلة بدون تصعيد الصلاحيات
    schtasks /create ^
      /tn "XPharma-Warehouse-Sync" ^
      /tr "\"%~dp0xpharma-agent.exe\" -daemon -no-prompt" ^
      /sc ONLOGON ^
      /f > nul 2>&1
)

if %errorlevel% neq 0 (
    echo [خطا] فشل تسجيل المهمة في Task Scheduler.
    echo        جاري المحاولة عبر مجلد بدء التشغيل كحل بديل...
    
    :: حل بديل: نسخ اختصار في مجلد Startup
    set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
    
    echo @echo off > "%STARTUP%\XPharma-Sync.bat"
    echo cd /d "%~dp0" >> "%STARTUP%\XPharma-Sync.bat"
    echo start /B "" "%~dp0xpharma-agent.exe" -daemon -no-prompt >> "%STARTUP%\XPharma-Sync.bat"
    
    echo [بديل] تم النسخ في مجلد Startup: %STARTUP%\XPharma-Sync.bat
    echo         البرنامج سيعمل تلقائياً عند تسجيل الدخول إلى الويندوز.
) else (
    echo [OK] تم تسجيل المهمة بنجاح في Windows Task Scheduler!
)

echo.
echo [3/3] التحقق من التسجيل...
schtasks /query /tn "XPharma-Warehouse-Sync" /fo LIST 2>nul | findstr /i "Task Name\|Status\|Next Run"

echo.
echo ==================================================================
echo  [تم بنجاح] سيعمل البرنامج تلقائياً عند كل تشغيل للجهاز!
echo ==================================================================
echo.
echo  معلومات مهمة:
echo  - البرنامج سيعمل في الخلفية بعد كل إعادة تشغيل للجهاز.
echo  - سيرفع الداتا كل 60 ثانية بشكل تلقائي.
echo  - ملف السجل: %~dp0agent.log
echo.
set /p choice="هل تريد تشغيل البرنامج الآن أيضاً؟ (y/n): "
if /i "%choice%"=="y" (
    echo جاري تشغيل وكيل المزامنة في الخلفية...
    start /B "" "%~dp0xpharma-agent.exe" -daemon -no-prompt >> "%~dp0agent.log" 2>&1
    echo [تم] البرنامج يعمل الآن في الخلفية!
)
echo.
pause
