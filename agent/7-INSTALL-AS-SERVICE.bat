@echo off
chcp 65001 > nul
title XPharma - تثبيت كـ Windows Service (خدمة ويندوز دائمة)
color 0B

echo.
echo ==================================================================
echo         XPharma Warehouse Sync - Windows Service Installer
echo         تثبيت وكيل المزامنة كخدمة ويندوز تعمل بشكل دائم
echo ==================================================================
echo.
echo [!] هذه الطريقة الأكثر احترافية - البرنامج يعمل كـ Windows Service
echo     يعمل حتى قبل تسجيل الدخول، ويُعيد تشغيل نفسه تلقائياً عند الانقطاع
echo.

:: التحقق من الصلاحيات الإدارية
net session > nul 2>&1
if %errorlevel% neq 0 (
    echo [!] يتطلب صلاحيات المدير (Admin). جاري إعادة التشغيل برفع الصلاحيات...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo [تم] تشغيل بصلاحيات المدير (Administrator).
echo.

:: البحث عن NSSM (Non-Sucking Service Manager)
where nssm > nul 2>&1
if %errorlevel% neq 0 (
    echo [!] NSSM غير موجود، جاري تحميله...
    powershell -Command "& { Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'; Expand-Archive '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm'; Copy-Item '%TEMP%\nssm\nssm-2.24\win64\nssm.exe' -Destination 'C:\Windows\System32\nssm.exe' }"
    if %errorlevel% neq 0 (
        echo [!] تعذر تحميل NSSM. جاري استخدام sc.exe بديلاً...
        goto :SC_INSTALL
    )
    echo [OK] تم تثبيت NSSM بنجاح.
)

:: تثبيت باستخدام NSSM
echo [1/3] إزالة الخدمة القديمة إن وجدت...
nssm stop "XPharmaSync" > nul 2>&1
nssm remove "XPharmaSync" confirm > nul 2>&1

echo [2/3] جاري تثبيت الخدمة...
nssm install "XPharmaSync" "%~dp0xpharma-agent.exe"
nssm set "XPharmaSync" AppParameters "-daemon -no-prompt"
nssm set "XPharmaSync" AppDirectory "%~dp0"
nssm set "XPharmaSync" DisplayName "XPharma Warehouse Sync Agent"
nssm set "XPharmaSync" Description "مزامنة تلقائية لقاعدة بيانات الفايربيرد مع سحابة xpharma"
nssm set "XPharmaSync" Start SERVICE_AUTO_START
nssm set "XPharmaSync" AppStdout "%~dp0agent.log"
nssm set "XPharmaSync" AppStderr "%~dp0agent-error.log"
nssm set "XPharmaSync" AppRestartDelay 5000

echo [3/3] جاري تشغيل الخدمة...
nssm start "XPharmaSync"

if %errorlevel% equ 0 (
    echo.
    echo ==================================================================
    echo  [تم بنجاح] XPharma Sync مثبتة كـ Windows Service!
    echo ==================================================================
    echo  - تعمل تلقائياً مع تشغيل الجهاز (حتى بدون تسجيل دخول)
    echo  - تُعيد تشغيل نفسها في 5 ثواني لو انقطعت
    echo  - السجلات في: %~dp0agent.log
    echo ==================================================================
    goto :END
)

:SC_INSTALL
echo [بديل] استخدام sc.exe لتثبيت الخدمة...
sc stop "XPharmaSync" > nul 2>&1
sc delete "XPharmaSync" > nul 2>&1

sc create "XPharmaSync" ^
  binPath= "\"%~dp0xpharma-agent.exe\" -daemon -no-prompt" ^
  DisplayName= "XPharma Warehouse Sync" ^
  start= auto ^
  type= own

sc description "XPharmaSync" "مزامنة تلقائية لقاعدة بيانات الفايربيرد مع سحابة xpharma"

sc failure "XPharmaSync" reset= 60 actions= restart/5000/restart/5000/restart/5000

sc start "XPharmaSync"

echo.
echo ==================================================================
echo  [تم] تم تثبيت XPharma Sync كـ Windows Service عبر sc.exe
echo ==================================================================

:END
echo.
echo يمكنك التحقق من حالة الخدمة عبر:
echo   sc query XPharmaSync
echo.
pause
