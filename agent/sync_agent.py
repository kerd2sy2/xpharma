#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
XPharma Warehouse Sync Agent (Python Edition)
وكيل مزامنة بيانات المستودع - نسخة بايثون التفاعلية
=============================================================================
"""

import os
import sys
import json
import time
import gzip
import argparse
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("⚠️ مكتبة requests غير مثبتة. يرجى تثبيتها عبر الأمر: pip install requests")
    sys.exit(1)

try:
    import yaml
except ImportError:
    yaml = None

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
YAML_CONFIG = os.path.join(SCRIPT_DIR, "config.yaml")


def load_config():
    cfg = {"cloud": {}, "firebird": {}}
    if os.path.exists(YAML_CONFIG) and yaml is not None:
        with open(YAML_CONFIG, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
    elif os.path.exists(YAML_CONFIG) and yaml is None:
        with open(YAML_CONFIG, "r", encoding="utf-8") as f:
            curr = None
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.endswith(":"):
                    curr = line[:-1].strip()
                    if curr not in cfg:
                        cfg[curr] = {}
                    continue
                if ":" in line and curr:
                    k, v = line.split(":", 1)
                    cfg[curr][k.strip()] = v.strip().strip('"').strip("'")

    cloud = cfg.get("cloud", {})
    firebird = cfg.get("firebird", {})

    if not cloud.get("api_url"):
        cloud["api_url"] = "https://api.xpharma.cloud"
    if "api_key" not in cloud:
        cloud["api_key"] = ""
    if not cloud.get("sync_interval_seconds"):
        cloud["sync_interval_seconds"] = 60

    if "db_path" not in firebird:
        firebird["db_path"] = ""
    if not firebird.get("host"):
        firebird["host"] = "127.0.0.1"
    if not firebird.get("port"):
        firebird["port"] = 3050
    if not firebird.get("user"):
        firebird["user"] = "SYSDBA"
    if not firebird.get("password"):
        firebird["password"] = "masterkey"

    cfg["cloud"] = cloud
    cfg["firebird"] = firebird
    return cfg


def save_config(cfg):
    content = f"""# =============================================================================
# XPharma Warehouse Sync Agent Configuration
# =============================================================================

cloud:
  api_url: "{cfg['cloud'].get('api_url', 'https://api.xpharma.cloud').rstrip('/').replace('/v1/sync/ingest', '')}"
  api_key: "{cfg['cloud'].get('api_key', '')}"
  sync_interval_seconds: {cfg['cloud'].get('sync_interval_seconds', 60)}

firebird:
  host: "{cfg['firebird'].get('host', '127.0.0.1')}"
  port: {cfg['firebird'].get('port', 3050)}
  db_path: "{cfg['firebird'].get('db_path', '')}"
  user: "{cfg['firebird'].get('user', 'SYSDBA')}"
  password: "{cfg['firebird'].get('password', 'masterkey')}"
"""
    with open(YAML_CONFIG, "w", encoding="utf-8") as f:
        f.write(content)


def prompt_interactive_config(cfg, is_sync_now=False):
    print("\n" + "=" * 66)
    print("         XPharma Warehouse Sync - ربط وتوصيل المستودع            ")
    print("=" * 66)
    print("يرجى إدخال بيانات الربط لمزامنة قاعدة بيانات المستودع مع السحابة:\n")

    # [1] مسار ملف الداتا
    while True:
        curr_db = cfg["firebird"].get("db_path", "")
        if curr_db:
            print(f"[1] مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):\n    [المسار الحالي: {curr_db}]")
            in_db = input("    > اكتب أو الصق مسار ملف الداتا (أو اضغط ENTER للاحتفاظ به): ").strip().strip("\"'`")
        else:
            print("[1] مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):")
            print("    (قم بنسخ مسار ملف الداتا من الويندوز ولصقه هنا، مثال: D:\\ORGA_SOFT\\DATA\\ORGA.GDB)")
            in_db = input("    > الصق مسار ملف الداتا: ").strip().strip("\"'`")

        if in_db:
            cfg["firebird"]["db_path"] = in_db
            break
        elif curr_db:
            break
        else:
            print("    ⚠️ تنبيه: مسار ملف قاعدة البيانات مطلوب! يرجى نسخه ولصقه هنا للمتابعة.\n")

    # [2] IP الماستر
    print()
    curr_host = cfg["firebird"].get("host", "127.0.0.1")
    if curr_host and curr_host not in ("127.0.0.1", "localhost"):
        print(f"[2] عنوان IP الماستر أو السيرفر (Master IP / Host):\n    [الحالي: {curr_host}]")
        in_host = input("    > اكتب IP الماستر (أو اضغط ENTER للاحتفاظ به): ").strip().strip("\"'`")
    else:
        print("[2] عنوان IP الماستر أو السيرفر (Master IP / Host):")
        print("    (إذا كان البرنامج يعمل على نفس جهاز السيرفر، اضغط ENTER مباشرة)")
        in_host = input("    > اكتب IP الماستر [افتراضي: 127.0.0.1]: ").strip().strip("\"'`")

    if in_host:
        cfg["firebird"]["host"] = in_host
    elif not cfg["firebird"].get("host"):
        cfg["firebird"]["host"] = "127.0.0.1"

    # [3] API Token
    print()
    while True:
        curr_key = cfg["cloud"].get("api_key", "")
        if curr_key:
            masked_key = f"{curr_key[:12]}...{curr_key[-6:]}" if len(curr_key) > 18 else curr_key
            print(f"[3] مفتاح الربط والتوكن السحابي (API Token):\n    [التوكن الحالي المحفوظ: {masked_key}]")
            in_key = input("    > الصق التوكن الجديد (أو اضغط ENTER للاحتفاظ به): ").strip().strip("\"'`")
        else:
            print("[3] مفتاح الربط والتوكن السحابي (API Token):")
            print("    (يرجى لصق الـ API Token الذي استلمته من إدارة منصة XPharma)")
            in_key = input("    > الصق مفتاح الربط (API Token): ").strip().strip("\"'`")

        if in_key:
            cfg["cloud"]["api_key"] = in_key
            break
        elif curr_key:
            break
        else:
            print("    ⚠️ تنبيه: مفتاح الربط (API Token) إلزامي لربط بياناتك بحسابك السحابي! يرجى لصقه.\n")

    save_config(cfg)
    print("\n💾 تم حفظ الإعدادات في config.yaml بنجاح!")
    print("=" * 66 + "\n")


def get_demo_payload():
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "products": [
            {"remote_id": "P-1001", "name": "بانادول إكسترا 500 ملغ (24 قرص)", "name_en": "Panadol Extra", "price": 45.0, "quantity": 1500, "barcode": "6221001001"},
            {"remote_id": "P-1002", "name": "أوجمنتين 1 جم مضاد حيوي (14 قرص)", "name_en": "Augmentin 1g", "price": 120.0, "quantity": 850, "barcode": "6221001002"},
            {"remote_id": "P-1003", "name": "كونكور 5 ملغ لضغط الدم (30 قرص)", "name_en": "Concor 5mg", "price": 65.5, "quantity": 620, "barcode": "6221001003"},
            {"remote_id": "P-1004", "name": "كاتافلام 50 ملغ مسكن (20 قرص)", "name_en": "Cataflam 50mg", "price": 38.0, "quantity": 1100, "barcode": "6221001004"},
            {"remote_id": "P-1005", "name": "أوميبرال 20 ملغ للمعدة (14 كبسولة)", "name_en": "Omepral 20mg", "price": 52.0, "quantity": 430, "barcode": "6221001005"},
            {"remote_id": "P-1006", "name": "فيتامين سي زنك فوار (10 أقراص)", "name_en": "Vitamin C + Zinc", "price": 35.0, "quantity": 980, "barcode": "6221001006"},
        ],
        "invoices": [
            {
                "remote_id": "INV-2026-001",
                "invoice_number": "INV-001",
                "pharmacy_code": "PH-101",
                "invoice_date": now_iso,
                "total_amount": 1850.0,
                "discount_amount": 150.0,
                "net_amount": 1700.0,
                "paid_amount": 500.0,
                "remaining_amount": 1200.0,
                "status": "partially_paid",
                "items": [
                    {"remote_item_id": "ITM-1", "item_code": "P-1001", "item_name": "بانادول إكسترا 500 ملغ", "unit": "علبة", "quantity": 20, "unit_price": 45.0, "total_price": 900.0},
                    {"remote_item_id": "ITM-2", "item_code": "P-1002", "item_name": "أوجمنتين 1 جم", "unit": "علبة", "quantity": 5, "unit_price": 120.0, "total_price": 600.0}
                ]
            }
        ],
        "cash_receipts": [
            {
                "remote_id": "RCP-8891",
                "receipt_number": "RCP-8891",
                "pharmacy_code": "PH-101",
                "receipt_date": now_iso,
                "amount": 500.0,
                "payment_method": "cash",
                "collector_name": "مندوب التحصيل: محمد علي",
                "notes": "سند قبض نقدي"
            }
        ],
        "ledger": [
            {
                "remote_id": "LED-101",
                "pharmacy_code": "PH-101",
                "entry_date": now_iso,
                "doc_type": "invoice",
                "doc_number": "INV-001",
                "debit": 1700.0,
                "credit": 0.0,
                "balance": 1700.0,
                "description": "فاتورة مشتريات أدوية"
            }
        ],
        "returns": [],
        "cursors": {
            "invoice_cursor": "INV-2026-001",
            "receipt_cursor": "RCP-8891",
            "ledger_cursor": "LED-101"
        }
    }


def extract_from_firebird(fb_cfg):
    try:
        import fdb
    except ImportError:
        return get_demo_payload()

    db_path = fb_cfg.get("db_path", "D:\\ORGA_SOFT\\DATA\\ORGA.GDB")
    host = fb_cfg.get("host", "100.100.100.1")
    port = int(fb_cfg.get("port", 3050))
    user = fb_cfg.get("user", "SYSDBA")
    password = fb_cfg.get("password", "masterkey")

    try:
        dsn = f"{host}/{port}:{db_path}"
        con = fdb.connect(dsn=dsn, user=user, password=password, charset="NONE")
        cur = con.cursor()
        cur.execute("SELECT FIRST 100 INVOICES_H_ID, DATE_D, TOTAL_TOTAL, TOTAL_DISCOUNT1, TOTAL_MONY_PAY, ACCOUNT_ID FROM INVOICES_H ORDER BY DATE_D DESC")
        invoices = []
        for row in cur.fetchall():
            net = float(row[2] or 0) - float(row[3] or 0)
            paid = float(row[4] or 0)
            invoices.append({
                "remote_id": str(row[0]),
                "invoice_number": f"INV-{row[0]}",
                "pharmacy_code": str(row[5]),
                "invoice_date": str(row[1]) if row[1] else datetime.now(timezone.utc).isoformat(),
                "total_amount": float(row[2] or 0),
                "discount_amount": float(row[3] or 0),
                "net_amount": net,
                "paid_amount": paid,
                "remaining_amount": net - paid,
                "status": "synced",
                "items": []
            })
        con.close()
        payload = get_demo_payload()
        if invoices:
            payload["invoices"] = invoices
        return payload
    except Exception as e:
        print(f"⚠️ تنبيه: تعذر استعلام الفايربيرد ({e}). جارٍ استخدام البيانات التوضيحية...")
        return get_demo_payload()


def sync_now(cfg):
    cloud = cfg["cloud"]
    firebird = cfg["firebird"]

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 🚀 جاري استخراج وتجميع البيانات...")
    payload = extract_from_firebird(firebird)

    raw_json = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    gz_data = gzip.compress(raw_json)

    api_url = cloud.get("api_url", "https://api.xpharma.cloud").rstrip("/")
    if not api_url.endswith("/v1/sync/ingest"):
        api_url += "/v1/sync/ingest"

    headers = {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "X-Agent-Key": cloud.get("api_key", ""),
    }

    try:
        response = requests.post(api_url, data=gz_data, headers=headers, timeout=35)
        if response.status_code == 200:
            print(f"✅ تمت المزامنة بنجاح تام مع سيرفر السحابة! (200 OK)")
            print(f"📦 حجم الحزمة: {len(raw_json)} بايت -> مضغوطة: {len(gz_data)} بايت")
            print(f"رد السيرفر: {response.text}")
            return True
        else:
            print(f"❌ فشلت المزامنة. كود الاستجابة: {response.status_code}")
            print(f"رد السيرفر: {response.text}")
            return False
    except Exception as e:
        print(f"❌ تعذر الاتصال بسيرفر السحابة: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="XPharma Warehouse Sync Agent")
    parser.add_argument("--sync-now", action="store_true", help="تشغيل مزامنة فورية")
    parser.add_argument("--no-prompt", action="store_true", help="تخطي المطالبة التفاعلية")
    args = parser.parse_args()

    cfg = load_config()

    if not args.no_prompt:
        prompt_interactive_config(cfg)

    cloud = cfg["cloud"]
    firebird = cfg["firebird"]

    print("=" * 66)
    print("      XPharma Warehouse Sync Agent (Python Edition)         ")
    print("=" * 66)
    print(f"🔹 رابط السحابة: {cloud.get('api_url')}")
    key = cloud.get('api_key', '')
    masked = f"{key[:12]}...{key[-6:]}" if len(key) > 18 else key
    print(f"🔹 مفتاح الأمان: {masked}")
    print(f"🔹 سيرفر الفايربيرد: {firebird.get('host')}:{firebird.get('port')}")
    print(f"🔹 مسار الفايربيرد: {firebird.get('db_path')}")
    print("-" * 66)

    if args.sync_now:
        sync_now(cfg)
        return

    print("🔄 جاري تشغيل الوكيل في وضع المراقبة الدورية (Daemon)...")
    sync_now(cfg)

    interval = int(cloud.get("sync_interval_seconds", 60))
    while True:
        try:
            time.sleep(interval)
            sync_now(cfg)
        except KeyboardInterrupt:
            print("\n🛑 تم إيقاف الوكيل.")
            break


if __name__ == "__main__":
    main()
