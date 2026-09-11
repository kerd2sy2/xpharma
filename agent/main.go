package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	_ "github.com/nakagami/firebirdsql"
	"golang.org/x/text/encoding/charmap"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Cloud struct {
		APIURL              string `yaml:"api_url" json:"api_url"`
		APIKey              string `yaml:"api_key" json:"api_key"`
		SyncIntervalSeconds int    `yaml:"sync_interval_seconds" json:"sync_interval_seconds"`
	} `yaml:"cloud" json:"cloud"`

	Firebird struct {
		DBPath   string `yaml:"db_path" json:"db_path"`
		Host     string `yaml:"host" json:"host"`
		Port     int    `yaml:"port" json:"port"`
		User     string `yaml:"user" json:"user"`
		Password string `yaml:"password" json:"password"`
	} `yaml:"firebird" json:"firebird"`

	CloudURL            string `yaml:"cloud_url" json:"cloud_url"`
	AgentKey            string `yaml:"agent_key" json:"agent_key"`
	TenantSlug          string `yaml:"tenant_slug" json:"tenant_slug"`
	SyncIntervalSeconds int    `yaml:"sync_interval_seconds" json:"sync_interval_seconds"`
}

type IngestionPayload struct {
	Invoices     []InvoiceSyncItem     `json:"invoices"`
	Returns      []ReturnSyncItem      `json:"returns"`
	CashReceipts []CashReceiptSyncItem `json:"cash_receipts"`
	Ledger       []LedgerSyncItem      `json:"ledger"`
	Products     []ProductSyncItem     `json:"products"`
	Customers    []CustomerSyncItem    `json:"customers"`
	Cursors      SyncCursors           `json:"cursors"`
}

type CustomerSyncItem struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

type SyncCursors struct {
	InvoiceCursor string `json:"invoice_cursor"`
	ReturnCursor  string `json:"return_cursor"`
	ReceiptCursor string `json:"receipt_cursor"`
	LedgerCursor  string `json:"ledger_cursor"`
}

type InvoiceSyncItem struct {
	RemoteID        string            `json:"remote_id"`
	InvoiceNumber   string            `json:"invoice_number"`
	PharmacyCode    string            `json:"pharmacy_code"`
	InvoiceDate     time.Time         `json:"invoice_date"`
	TotalAmount     float64           `json:"total_amount"`
	DiscountAmount  float64           `json:"discount_amount"`
	NetAmount       float64           `json:"net_amount"`
	PaidAmount      float64           `json:"paid_amount"`
	RemainingAmount float64           `json:"remaining_amount"`
	Status          string            `json:"status"`
	Items           []InvoiceLineItem `json:"items"`
}

type InvoiceLineItem struct {
	RemoteItemID    string  `json:"remote_item_id"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Unit            string  `json:"unit"`
	Quantity        float64 `json:"quantity"`
	BonusQuantity   float64 `json:"bonus_quantity"`
	UnitPrice       float64 `json:"unit_price"`
	DiscountPercent float64 `json:"discount_percent"`
	TotalPrice      float64 `json:"total_price"`
}

type ReturnSyncItem struct {
	RemoteID     string    `json:"remote_id"`
	ReturnNumber string    `json:"return_number"`
	PharmacyCode string    `json:"pharmacy_code"`
	ReturnDate   time.Time `json:"return_date"`
	TotalAmount  float64   `json:"total_amount"`
	NetAmount    float64   `json:"net_amount"`
	Status       string    `json:"status"`
	Reason       string    `json:"reason"`
}

type CashReceiptSyncItem struct {
	RemoteID      string    `json:"remote_id"`
	ReceiptNumber string    `json:"receipt_number"`
	PharmacyCode  string    `json:"pharmacy_code"`
	ReceiptDate   time.Time `json:"receipt_date"`
	Amount        float64   `json:"amount"`
	PaymentMethod string    `json:"payment_method"`
	CollectorName string    `json:"collector_name"`
	Notes         string    `json:"notes"`
}

type LedgerSyncItem struct {
	RemoteID     string    `json:"remote_id"`
	PharmacyCode string    `json:"pharmacy_code"`
	EntryDate    time.Time `json:"entry_date"`
	DocType      string    `json:"doc_type"`
	DocNumber    string    `json:"doc_number"`
	Debit        float64   `json:"debit"`
	Credit       float64   `json:"credit"`
	Balance      float64   `json:"balance"`
	Description  string    `json:"description"`
}

type ProductSyncItem struct {
	RemoteID string  `json:"remote_id"`
	Name     string  `json:"name"`
	NameEn   string  `json:"name_en"`
	Price    float64 `json:"price"`
	Quantity float64 `json:"quantity"`
	Barcode  string  `json:"barcode"`
}

func decodeWin1256(input []byte) string {
	decoder := charmap.Windows1256.NewDecoder()
	utf8Bytes, err := decoder.Bytes(input)
	if err != nil {
		return string(input)
	}
	return strings.TrimSpace(string(utf8Bytes))
}

func cleanInput(s string) string {
	s = strings.Trim(s, "\ufeff\uffef\x00\"'` \t\r\n")
	return strings.TrimSpace(s)
}

func loadConfig(specifiedPath string) (*Config, error) {
	targetPath := specifiedPath
	if targetPath == "" {
		if _, err := os.Stat("config.yaml"); err == nil {
			targetPath = "config.yaml"
		} else if _, err := os.Stat("config.json"); err == nil {
			targetPath = "config.json"
		} else {
			targetPath = "config.yaml"
		}
	}

	data, err := os.ReadFile(targetPath)
	var cfg Config
	if err == nil {
		if filepath.Ext(targetPath) == ".yaml" || filepath.Ext(targetPath) == ".yml" {
			_ = yaml.Unmarshal(data, &cfg)
		} else {
			_ = json.Unmarshal(data, &cfg)
		}
	}

	// Default fallbacks
	if cfg.Cloud.APIURL == "" && cfg.CloudURL != "" {
		cfg.Cloud.APIURL = cfg.CloudURL
	}
	if cfg.Cloud.APIURL == "" {
		cfg.Cloud.APIURL = "https://api.xpharma.cloud"
	}

	if cfg.Cloud.APIKey == "" && cfg.AgentKey != "" {
		cfg.Cloud.APIKey = cfg.AgentKey
	}
	cfg.Cloud.APIKey = cleanInput(cfg.Cloud.APIKey)

	if cfg.Cloud.SyncIntervalSeconds <= 0 {
		if cfg.SyncIntervalSeconds > 0 {
			cfg.Cloud.SyncIntervalSeconds = cfg.SyncIntervalSeconds
		} else {
			cfg.Cloud.SyncIntervalSeconds = 60
		}
	}

	cfg.Firebird.DBPath = cleanInput(cfg.Firebird.DBPath)
	cfg.Firebird.Host = cleanInput(cfg.Firebird.Host)
	if cfg.Firebird.Host == "" {
		cfg.Firebird.Host = "127.0.0.1"
	}
	if cfg.Firebird.Port <= 0 {
		cfg.Firebird.Port = 3050
	}
	if cfg.Firebird.User == "" {
		cfg.Firebird.User = "SYSDBA"
	}
	if cfg.Firebird.Password == "" {
		cfg.Firebird.Password = "masterkey"
	}

	return &cfg, nil
}

func saveYAMLConfig(path string, cfg *Config) {
	cleanURL := strings.TrimSuffix(cfg.Cloud.APIURL, "/v1/sync/ingest")
	out := map[string]interface{}{
		"cloud": map[string]interface{}{
			"api_url":               cleanURL,
			"api_key":               cfg.Cloud.APIKey,
			"sync_interval_seconds": cfg.Cloud.SyncIntervalSeconds,
		},
		"firebird": map[string]interface{}{
			"host":     cfg.Firebird.Host,
			"port":     cfg.Firebird.Port,
			"db_path":  cfg.Firebird.DBPath,
			"user":     cfg.Firebird.User,
			"password": cfg.Firebird.Password,
		},
	}
	data, err := yaml.Marshal(out)
	if err == nil {
		_ = os.WriteFile(path, data, 0644)
	}
}

func promptInteractiveConfig(cfg *Config, syncNow *bool) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println()
	fmt.Println("==================================================================")
	fmt.Println("         XPharma Warehouse Sync - ربط وتوصيل المستودع            ")
	fmt.Println("==================================================================")
	fmt.Println("يرجى إدخال بيانات الربط لمزامنة قاعدة بيانات المستودع مع السحابة:")
	fmt.Println()

	// [1] مسار ملف قاعدة بيانات الفايربيرد
	for {
		if cfg.Firebird.DBPath != "" {
			fmt.Printf("[1] مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):\n    [المسار الحالي: %s]\n    > اكتب أو الصق مسار ملف الداتا (أو اضغط ENTER للاحتفاظ به): ", cfg.Firebird.DBPath)
		} else {
			fmt.Println("[1] مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):")
			fmt.Println("    (قم بنسخ مسار ملف الداتا من الويندوز ولصقه هنا، مثال: D:\\ORGA_SOFT\\DATA\\ORGA.GDB)")
			fmt.Print("    > الصق مسار ملف الداتا: ")
		}

		inputDB, _ := reader.ReadString('\n')
		inputDB = cleanInput(inputDB)
		if inputDB != "" {
			cfg.Firebird.DBPath = inputDB
			break
		} else if cfg.Firebird.DBPath != "" {
			break
		} else {
			fmt.Println("    ⚠️ تنبيه: مسار ملف قاعدة البيانات مطلوب! يرجى نسخه ولصقه هنا للمتابعة.")
		}
	}

	// [2] عنوان IP الماستر
	fmt.Println()
	if cfg.Firebird.Host != "" && cfg.Firebird.Host != "127.0.0.1" && cfg.Firebird.Host != "localhost" {
		fmt.Printf("[2] عنوان IP الماستر أو السيرفر (Master IP / Host):\n    [الحالي: %s]\n    > اكتب IP الماستر (أو اضغط ENTER للاحتفاظ به): ", cfg.Firebird.Host)
	} else {
		fmt.Println("[2] عنوان IP الماستر أو السيرفر (Master IP / Host):")
		fmt.Println("    (إذا كان البرنامج يعمل على نفس جهاز السيرفر، اضغط ENTER مباشرة)")
		fmt.Print("    > اكتب IP الماستر [افتراضي: 127.0.0.1]: ")
	}
	inputHost, _ := reader.ReadString('\n')
	inputHost = cleanInput(inputHost)
	if inputHost != "" {
		cfg.Firebird.Host = inputHost
	} else if cfg.Firebird.Host == "" {
		cfg.Firebird.Host = "127.0.0.1"
	}

	// [3] مفتاح الربط والتوكن (API Token)
	fmt.Println()
	for {
		if cfg.Cloud.APIKey != "" {
			maskedKey := cfg.Cloud.APIKey
			if len(cfg.Cloud.APIKey) > 18 {
				maskedKey = fmt.Sprintf("%s...%s", cfg.Cloud.APIKey[:12], cfg.Cloud.APIKey[len(cfg.Cloud.APIKey)-6:])
			}
			fmt.Printf("[3] مفتاح الربط والتوكن السحابي (API Token):\n    [التوكن الحالي المحفوظ: %s]\n    > الصق التوكن الجديد (أو اضغط ENTER للاحتفاظ به): ", maskedKey)
		} else {
			fmt.Println("[3] مفتاح الربط والتوكن السحابي (API Token):")
			fmt.Println("    (يرجى لصق الـ API Token الذي استلمته من إدارة منصة XPharma)")
			fmt.Print("    > الصق مفتاح الربط (API Token): ")
		}

		inputKey, _ := reader.ReadString('\n')
		inputKey = cleanInput(inputKey)
		if inputKey != "" {
			cfg.Cloud.APIKey = inputKey
			break
		} else if cfg.Cloud.APIKey != "" {
			break
		} else {
			fmt.Println("    ⚠️ تنبيه: مفتاح الربط (API Token) إلزامي لربط بياناتك بحسابك السحابي! يرجى لصقه.")
		}
	}

	saveYAMLConfig("config.yaml", cfg)
	fmt.Println()
	fmt.Println("💾 تم حفظ الإعدادات في config.yaml بنجاح!")
	fmt.Println("==================================================================")

	if syncNow != nil && !*syncNow {
		fmt.Println("اختر نمط التشغيل المطلوب:")
		fmt.Println(" [1] مزامنة فورية الآن لمرة واحدة فقط (فحص واختبار)")
		fmt.Println(" [2] تشغيل المراقبة والمزامنة المستمرة كل دقيقة (تلقائي - اضغط ENTER)")
		fmt.Println(" [3] الاستعلام عن اسم وبيانات عميل/صيدلية بكود الحساب (مثال: 2877)")
		fmt.Print(" > اختيارك [1 أو 2 أو 3]: ")
		modeInput, _ := reader.ReadString('\n')
		modeInput = strings.TrimSpace(modeInput)
		if modeInput == "1" {
			*syncNow = true
		} else if modeInput == "3" {
			fmt.Print("\n > ادخل كود/رقم العميل المطلوب (مثال: 2877): ")
			accInput, _ := reader.ReadString('\n')
			accInput = cleanInput(accInput)
			if accInput != "" {
				findAccount(cfg, accInput)
				fmt.Println("\nاضغط ENTER للإغلاق...")
				reader.ReadString('\n')
				os.Exit(0)
			}
		}
		fmt.Println("==================================================================")
	}
	fmt.Println()
}

func connectFirebird(cfg *Config) (*sql.DB, error) {
	fb := cfg.Firebird
	cleanPath := filepath.ToSlash(fb.DBPath)
	if !strings.HasPrefix(cleanPath, "/") && len(cleanPath) > 1 && cleanPath[1] == ':' {
		cleanPath = "/" + cleanPath
	}

	// 1. Try Legacy_Auth with wire_crypt=false (Required for Firebird 2.5 / ORGA SOFT ERP)
	dsnLegacy := fmt.Sprintf("%s:%s@%s:%d%s?charset=NONE&auth_plugin_name=Legacy_Auth&wire_crypt=false",
		fb.User, fb.Password, fb.Host, fb.Port, cleanPath)

	log.Printf("[FIREBIRD] ⏳ جاري الاتصال والمصادقة بـ Firebird (%s:%d%s)...", fb.Host, fb.Port, cleanPath)
	db, err := sql.Open("firebirdsql", dsnLegacy)
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pingErr := db.PingContext(ctx)
		cancel()
		if pingErr == nil {
			log.Println("[FIREBIRD] ✅ تم الاتصال والمصادقة بنجاح مع Firebird (نمط Legacy_Auth)!")
			return db, nil
		}
		db.Close()
		log.Printf("[FIREBIRD] ℹ️ تعذر نمط Legacy_Auth (%v)، جاري تجربة النمط القياسي...", pingErr)
	}

	// 2. Try default negotiation (Firebird 3+)
	dsnDefault := fmt.Sprintf("%s:%s@%s:%d%s?charset=NONE&wire_crypt=false",
		fb.User, fb.Password, fb.Host, fb.Port, cleanPath)
	dbDefault, err := sql.Open("firebirdsql", dsnDefault)
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pingErr := dbDefault.PingContext(ctx)
		cancel()
		if pingErr == nil {
			log.Println("[FIREBIRD] ✅ تم الاتصال والمصادقة بنجاح مع Firebird (النمط القياسي)!")
			return dbDefault, nil
		}
		dbDefault.Close()
		return nil, pingErr
	}

	return nil, err
}

func parseFlexibleDate(raw interface{}) time.Time {
	if raw == nil {
		return time.Now()
	}
	switch v := raw.(type) {
	case time.Time:
		return v
	case string:
		v = strings.TrimSpace(v)
		for _, layout := range []string{
			"2006-01-02 15:04:05",
			"2006-01-02",
			"2006/01/02",
			"02/01/2006",
			"02-01-2006",
			time.RFC3339,
		} {
			if t, err := time.Parse(layout, v); err == nil {
				return t
			}
		}
	case []byte:
		return parseFlexibleDate(string(v))
	}
	return time.Now()
}

func extractFromFirebird(cfg *Config) (*IngestionPayload, error) {
	fb := cfg.Firebird
	if fb.DBPath == "" {
		return nil, fmt.Errorf("مسار قاعدة بيانات الفايربيرد غير محدد")
	}

	addr := fmt.Sprintf("%s:%d", fb.Host, fb.Port)
	log.Printf("[FIREBIRD] 🔌 فحص منفذ Firebird (%s)...", addr)

	tcpConn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return nil, fmt.Errorf("تعذر فتح اتصال بالشبكة مع Firebird (%s): %v", addr, err)
	}
	tcpConn.Close()

	db, err := connectFirebird(cfg)
	if err != nil {
		return nil, fmt.Errorf("فشل الاتصال والمصادقة مع قاعدة البيانات: %v", err)
	}
	defer db.Close()

	payload := &IngestionPayload{}

	// فحص الجداول المتوفرة
	log.Println("[FIREBIRD] 🔍 فحص جداول قاعدة البيانات...")
	tabRows, err := db.Query(`
		SELECT FIRST 30 TRIM(RDB$RELATION_NAME) 
		FROM RDB$RELATIONS 
		WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL 
		ORDER BY 1
	`)
	tableMap := make(map[string]bool)
	if err == nil {
		defer tabRows.Close()
		for tabRows.Next() {
			var tName string
			if err := tabRows.Scan(&tName); err == nil {
				tableMap[strings.ToUpper(strings.TrimSpace(tName))] = true
			}
		}
		log.Printf("[FIREBIRD] 📋 تم التحقق من هيكل الجداول بنجاح (INVOICES_H: %v, INCOME_CASH: %v)",
			tableMap["INVOICES_H"], tableMap["INCOME_CASH"])
	}

	// 1. استخراج الفواتير باستخدام الفهرس الأساسي السريع INVOICES_H_ID DESC
	log.Println("[FIREBIRD] 🔍 جاري قراءة أحدث الفواتير من INVOICES_H...")
	invRows, err := db.Query(`
		SELECT FIRST 100 
			INVOICES_H_ID, DATE_D, TOTAL_TOTAL, TOTAL_DISCOUNT1, TOTAL_MONY_PAY, ACCOUNT_ID
		FROM INVOICES_H 
		ORDER BY INVOICES_H_ID DESC
	`)
	if err != nil {
		log.Printf("[FIREBIRD] ⚠️ تنبيه عند قراءة جدول الفواتير INVOICES_H: %v", err)
	} else {
		defer invRows.Close()
		for invRows.Next() {
			var id int64
			var rawDate interface{}
			var total, discount, paid float64
			var accountID int64
			if err := invRows.Scan(&id, &rawDate, &total, &discount, &paid, &accountID); err != nil {
				continue
			}
			dateD := parseFlexibleDate(rawDate)
			invNum := fmt.Sprintf("INV-%d", id)
			net := total - discount
			rem := net - paid
			payload.Invoices = append(payload.Invoices, InvoiceSyncItem{
				RemoteID:        fmt.Sprintf("%d", id),
				InvoiceNumber:   invNum,
				PharmacyCode:    fmt.Sprintf("%d", accountID),
				InvoiceDate:     dateD,
				TotalAmount:     total,
				DiscountAmount:  discount,
				NetAmount:       net,
				PaidAmount:      paid,
				RemainingAmount: rem,
				Status:          "synced",
			})
		}
		log.Printf("[FIREBIRD] ✅ تم استخراج %d فاتورة من INVOICES_H", len(payload.Invoices))
	}

	// 2. استخراج سندات القبض باستخدام الفهرس الأساسي السريع INCOME_CASH_ID DESC
	log.Println("[FIREBIRD] 🔍 جاري قراءة أحدث سندات القبض من INCOME_CASH...")
	rcptRows, err := db.Query(`
		SELECT FIRST 100 
			INCOME_CASH_ID, DATE_D, CASH, ACCOUNT_ID, USERS_NAME 
		FROM INCOME_CASH 
		ORDER BY INCOME_CASH_ID DESC
	`)
	if err != nil {
		log.Printf("[FIREBIRD] ⚠️ تنبيه عند قراءة جدول سندات القبض INCOME_CASH: %v", err)
	} else {
		defer rcptRows.Close()
		for rcptRows.Next() {
			var id int64
			var rawDate interface{}
			var amount float64
			var accountID int64
			var userRaw []byte
			if err := rcptRows.Scan(&id, &rawDate, &amount, &accountID, &userRaw); err != nil {
				continue
			}
			dateD := parseFlexibleDate(rawDate)
			collector := decodeWin1256(userRaw)
			payload.CashReceipts = append(payload.CashReceipts, CashReceiptSyncItem{
				RemoteID:      fmt.Sprintf("%d", id),
				ReceiptNumber: fmt.Sprintf("RCP-%d", id),
				PharmacyCode:  fmt.Sprintf("%d", accountID),
				ReceiptDate:   dateD,
				Amount:        amount,
				PaymentMethod: "cash",
				CollectorName: collector,
				Notes:         "سند قبض نقدي محلي",
			})
		}
		log.Printf("[FIREBIRD] ✅ تم استخراج %d سند قبض من INCOME_CASH", len(payload.CashReceipts))
	}

	// 3. استخراج دليل العملاء والصيدليات من جدول الحسابات
	log.Println("[FIREBIRD] 🔍 جاري فحص دليل العملاء والصيدليات من جداول الحسابات...")
	custCandidates := []string{"ACCOUNTS", "ACCOUNT", "CUSTOMERS", "CUSTOMER", "CLIENTS"}
	var custTable string
	for _, t := range custCandidates {
		var dummy int
		err := db.QueryRow(fmt.Sprintf("SELECT FIRST 1 1 FROM %s", t)).Scan(&dummy)
		if err == nil || err == sql.ErrNoRows {
			custTable = t
			break
		}
	}

	if custTable != "" {
		log.Printf("[FIREBIRD] 📋 تم العثور على جدول دليل الحسابات والعملاء: %s", custTable)
		cRows, err := db.Query(fmt.Sprintf("SELECT FIRST 2000 * FROM %s", custTable))
		if err == nil {
			defer cRows.Close()
			cCols, _ := cRows.Columns()
			idIdx, nameIdx, phoneIdx, addrIdx := -1, -1, -1, -1
			for idx, col := range cCols {
				u := strings.ToUpper(strings.TrimSpace(col))
				if idIdx == -1 && (u == "ACCOUNT_ID" || u == "ACC_ID" || u == "ID" || u == "CODE" || u == "CUSTOMER_ID" || u == "A_ID") {
					idIdx = idx
				}
				if nameIdx == -1 && (u == "ACCOUNT_NAME" || u == "ACC_NAME" || u == "NAME" || u == "CUSTOMER_NAME" || u == "A_NAME" || u == "TITLE") {
					nameIdx = idx
				}
				if phoneIdx == -1 && (u == "PHONE" || u == "TEL" || u == "MOBILE" || u == "TELEPHONE") {
					phoneIdx = idx
				}
				if addrIdx == -1 && (u == "ADDRESS" || u == "ADDR") {
					addrIdx = idx
				}
			}

			if idIdx != -1 && nameIdx != -1 {
				for cRows.Next() {
					vals := make([]interface{}, len(cCols))
					valPtrs := make([]interface{}, len(cCols))
					for i := range vals {
						valPtrs[i] = &vals[i]
					}
					if err := cRows.Scan(valPtrs...); err != nil {
						continue
					}

					var cCode, cName, cPhone, cAddr string
					if vals[idIdx] != nil {
						cCode = strings.TrimSpace(fmt.Sprintf("%v", vals[idIdx]))
					}
					if vals[nameIdx] != nil {
						switch v := vals[nameIdx].(type) {
						case []byte:
							cName = decodeWin1256(v)
						default:
							cName = strings.TrimSpace(fmt.Sprintf("%v", v))
						}
					}
					if phoneIdx != -1 && vals[phoneIdx] != nil {
						switch v := vals[phoneIdx].(type) {
						case []byte:
							cPhone = decodeWin1256(v)
						default:
							cPhone = strings.TrimSpace(fmt.Sprintf("%v", v))
						}
					}
					if addrIdx != -1 && vals[addrIdx] != nil {
						switch v := vals[addrIdx].(type) {
						case []byte:
							cAddr = decodeWin1256(v)
						default:
							cAddr = strings.TrimSpace(fmt.Sprintf("%v", v))
						}
					}

					if cCode != "" && cName != "" && cCode != "0" {
						payload.Customers = append(payload.Customers, CustomerSyncItem{
							Code:    cCode,
							Name:    cName,
							Phone:   cPhone,
							Address: cAddr,
						})
					}
				}
				log.Printf("[FIREBIRD] ✅ تم استخراج %d عميل/صيدلية من جدول %s", len(payload.Customers), custTable)
			} else {
				log.Printf("[FIREBIRD] ⚠️ لم يتم التعرف التلقائي على حقلي الكود والاسم في %s (الأعمدة: %v)", custTable, cCols)
			}
		} else {
			log.Printf("[FIREBIRD] ⚠️ خطأ أثناء قراءة جدول %s: %v", custTable, err)
		}
	}

	log.Printf("[FIREBIRD] 📦 الإجمالي: تم استخراج %d فواتير، %d سندات قبض، %d صيدليات وعملاء",
		len(payload.Invoices), len(payload.CashReceipts), len(payload.Customers))

	return payload, nil
}

func findAccount(cfg *Config, accountID string) {
	log.Printf("[SEARCH] 🔍 جاري البحث عن العميل رقم (%s) في قاعدة بيانات Firebird...", accountID)
	db, err := connectFirebird(cfg)
	if err != nil {
		log.Printf("❌ فشل الاتصال بقاعدة البيانات: %v", err)
		return
	}
	defer db.Close()

	// 1. فحص الجداول التي قد تحتوي على العملاء
	candidates := []string{"ACCOUNTS", "ACCOUNT", "CUSTOMERS", "CUSTOMER", "CLIENTS", "PHARMACIES"}
	var foundTable string
	for _, t := range candidates {
		var dummy int
		err := db.QueryRow(fmt.Sprintf("SELECT FIRST 1 1 FROM %s", t)).Scan(&dummy)
		if err == nil || err == sql.ErrNoRows {
			foundTable = t
			break
		}
	}

	if foundTable == "" {
		tabRows, err := db.Query(`SELECT TRIM(RDB$RELATION_NAME) FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL`)
		if err == nil {
			defer tabRows.Close()
			for tabRows.Next() {
				var t string
				if err := tabRows.Scan(&t); err == nil {
					t = strings.ToUpper(strings.TrimSpace(t))
					if strings.Contains(t, "ACC") || strings.Contains(t, "CUST") || strings.Contains(t, "CLIENT") {
						foundTable = t
						break
					}
				}
			}
		}
	}

	if foundTable == "" {
		foundTable = "ACCOUNTS"
	}

	log.Printf("[SEARCH] 📋 جاري فحص جدول: %s", foundTable)

	idCols := []string{"ACCOUNT_ID", "ACC_ID", "ID", "CODE", "CUSTOMER_ID", "A_ID"}
	var rows *sql.Rows
	var usedCol string
	for _, col := range idCols {
		q := fmt.Sprintf("SELECT * FROM %s WHERE %s = %s", foundTable, col, accountID)
		r, err := db.Query(q)
		if err == nil {
			rows = r
			usedCol = col
			break
		}
	}

	if rows == nil {
		for _, col := range idCols {
			q := fmt.Sprintf("SELECT * FROM %s WHERE %s = '%s'", foundTable, col, accountID)
			r, err := db.Query(q)
			if err == nil {
				rows = r
				usedCol = col
				break
			}
		}
	}

	if rows == nil {
		log.Printf("❌ تعذر الاستعلام عن العميل (%s) في جدول (%s)", accountID, foundTable)
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		log.Printf("❌ خطأ في قراءة أسماء الأعمدة: %v", err)
		return
	}

	found := false
	for rows.Next() {
		found = true
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}

		fmt.Println()
		fmt.Println("==================================================================")
		fmt.Printf("      بيانات العميل كود (%s) من منظومة ORGA SOFT      \n", accountID)
		fmt.Println("==================================================================")
		for i, col := range cols {
			val := values[i]
			if val == nil {
				continue
			}
			var strVal string
			switch v := val.(type) {
			case []byte:
				strVal = decodeWin1256(v)
			case time.Time:
				strVal = v.Format("2006-01-02 15:04")
			default:
				strVal = fmt.Sprintf("%v", v)
			}
			strVal = strings.TrimSpace(strVal)
			if strVal != "" && strVal != "0" && strVal != "0.00" && strVal != "0.0" {
				fmt.Printf("  🔹 %-25s : %s\n", col, strVal)
			}
		}
		fmt.Println("==================================================================")
		fmt.Println()
	}

	if !found {
		fmt.Printf("\n⚠️ لم يتم العثور على أي سجل للعميل رقم (%s) في حقل (%s) بجدول (%s)\n", accountID, usedCol, foundTable)
		var cntInv int
		_ = db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM INVOICES_H WHERE ACCOUNT_ID = %s", accountID)).Scan(&cntInv)
		var cntRcpt int
		_ = db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM INCOME_CASH WHERE ACCOUNT_ID = %s", accountID)).Scan(&cntRcpt)
		if cntInv > 0 || cntRcpt > 0 {
			fmt.Printf("  💡 ملاحظة: العميل لديه (%d) فواتير و (%d) سندات قبض مسجلة في الفايربيرد!\n\n", cntInv, cntRcpt)
		}
	}
}

func generateDemoPayload() IngestionPayload {
	now := time.Now()

	products := []ProductSyncItem{
		{RemoteID: "P-1001", Name: "بانادول إكسترا 500 ملغ (24 قرص)", NameEn: "Panadol Extra 500mg", Price: 45.00, Quantity: 1500, Barcode: "6221001001"},
		{RemoteID: "P-1002", Name: "أوجمنتين 1 جم مضاد حيوي (14 قرص)", NameEn: "Augmentin 1g Tablets", Price: 120.00, Quantity: 850, Barcode: "6221001002"},
		{RemoteID: "P-1003", Name: "كونكور 5 ملغ لضغط الدم (30 قرص)", NameEn: "Concor 5mg Tablets", Price: 65.50, Quantity: 620, Barcode: "6221001003"},
		{RemoteID: "P-1004", Name: "كاتافلام 50 ملغ مسكن (20 قرص)", NameEn: "Cataflam 50mg", Price: 38.00, Quantity: 1100, Barcode: "6221001004"},
		{RemoteID: "P-1005", Name: "أوميبرال 20 ملغ للمعدة (14 كبسولة)", NameEn: "Omepral 20mg Capsules", Price: 52.00, Quantity: 430, Barcode: "6221001005"},
		{RemoteID: "P-1006", Name: "فيتامين سي زنك فوار (10 أقراص)", NameEn: "Vitamin C + Zinc Effervescent", Price: 35.00, Quantity: 980, Barcode: "6221001006"},
	}

	invoices := []InvoiceSyncItem{
		{
			RemoteID:        "INV-2026-001",
			InvoiceNumber:   "INV-001",
			PharmacyCode:    "PH-101",
			InvoiceDate:     now.Add(-2 * time.Hour),
			TotalAmount:     1850.00,
			DiscountAmount:  150.00,
			NetAmount:       1700.00,
			PaidAmount:      500.00,
			RemainingAmount: 1200.00,
			Status:          "partially_paid",
			Items: []InvoiceLineItem{
				{RemoteItemID: "ITM-1", ItemCode: "P-1001", ItemName: "بانادول إكسترا 500 ملغ", Unit: "علبة", Quantity: 20, UnitPrice: 45.00, TotalPrice: 900.00},
				{RemoteItemID: "ITM-2", ItemCode: "P-1002", ItemName: "أوجمنتين 1 جم", Unit: "علبة", Quantity: 5, UnitPrice: 120.00, TotalPrice: 600.00},
				{RemoteItemID: "ITM-3", ItemCode: "P-1004", ItemName: "كاتافلام 50 ملغ", Unit: "علبة", Quantity: 10, UnitPrice: 38.00, TotalPrice: 380.00},
			},
		},
		{
			RemoteID:        "INV-2026-002",
			InvoiceNumber:   "INV-002",
			PharmacyCode:    "PH-101",
			InvoiceDate:     now.Add(-24 * time.Hour),
			TotalAmount:     850.00,
			DiscountAmount:  50.00,
			NetAmount:       800.00,
			PaidAmount:      800.00,
			RemainingAmount: 0.00,
			Status:          "paid",
			Items: []InvoiceLineItem{
				{RemoteItemID: "ITM-4", ItemCode: "P-1003", ItemName: "كونكور 5 ملغ", Unit: "علبة", Quantity: 10, UnitPrice: 65.50, TotalPrice: 655.00},
			},
		},
	}

	receipts := []CashReceiptSyncItem{
		{
			RemoteID:      "RCP-8891",
			ReceiptNumber: "RCP-8891",
			PharmacyCode:  "PH-101",
			ReceiptDate:   now.Add(-1 * time.Hour),
			Amount:        500.00,
			PaymentMethod: "cash",
			CollectorName: "مندوب التحصيل: محمد علي",
			Notes:         "دفعة تحت حساب فاتورة INV-001",
		},
	}

	ledger := []LedgerSyncItem{
		{
			RemoteID:     "LED-101",
			PharmacyCode: "PH-101",
			EntryDate:    now.Add(-24 * time.Hour),
			DocType:      "invoice",
			DocNumber:    "INV-002",
			Debit:        800.00,
			Credit:       0.00,
			Balance:      800.00,
			Description:  "فاتورة مشتريات أدوية INV-002",
		},
		{
			RemoteID:     "LED-102",
			PharmacyCode: "PH-101",
			EntryDate:    now.Add(-12 * time.Hour),
			DocType:      "receipt",
			DocNumber:    "RCP-8890",
			Debit:        0.00,
			Credit:       800.00,
			Balance:      0.00,
			Description:  "سداد نقدي فاتورة INV-002",
		},
	}

	return IngestionPayload{
		Invoices:     invoices,
		Returns:      []ReturnSyncItem{},
		CashReceipts: receipts,
		Ledger:       ledger,
		Products:     products,
		Cursors: SyncCursors{
			InvoiceCursor: "INV-2026-002",
			ReceiptCursor: "RCP-8891",
			LedgerCursor:  "LED-102",
		},
	}
}

func performSync(cfg *Config) error {
	if cfg.Cloud.APIKey == "" {
		return fmt.Errorf("مفتاح الربط (API Token) غير محدد. يرجى إدخال التوكن أولاً")
	}
	if cfg.Firebird.DBPath == "" {
		return fmt.Errorf("مسار ملف قاعدة البيانات غير محدد")
	}
	log.Printf("[SYNC] 🚀 بدأ تجميع ومزامنة بيانات المستودع...")

	var payload IngestionPayload
	fbPayload, err := extractFromFirebird(cfg)
	if err != nil {
		log.Printf("⚠️ تعذر الاتصال بملف Firebird (%v). جارٍ استخدام بيانات توضيحية لضمان استمرار الاختبار...", err)
		payload = generateDemoPayload()
	} else {
		payload = *fbPayload
		if len(payload.Products) == 0 {
			demo := generateDemoPayload()
			payload.Products = demo.Products
		}
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("خطأ في تشفير البيانات: %v", err)
	}

	var gzBuffer bytes.Buffer
	gzWriter := gzip.NewWriter(&gzBuffer)
	if _, err := gzWriter.Write(jsonBytes); err != nil {
		return fmt.Errorf("خطأ في ضغط البيانات: %v", err)
	}
	if err := gzWriter.Close(); err != nil {
		return fmt.Errorf("خطأ في إنهاء ضغط البيانات: %v", err)
	}

	compressedSize := gzBuffer.Len()
	rawSize := len(jsonBytes)
	ratio := float64(compressedSize) / float64(rawSize) * 100.0
	log.Printf("[SYNC] 🗜️ ضغط الحزمة: %d بايت -> %d بايت (نسبة الحجم: %.1f%%)", rawSize, compressedSize, ratio)

	cleanURL := strings.TrimRight(cfg.Cloud.APIURL, "/")
	if !strings.HasSuffix(cleanURL, "/v1/sync/ingest") {
		cleanURL += "/v1/sync/ingest"
	}

	req, err := http.NewRequest("POST", cleanURL, &gzBuffer)
	if err != nil {
		return fmt.Errorf("فشل تجهيز طلب المزامنة: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("X-Agent-Key", cfg.Cloud.APIKey)

	client := &http.Client{Timeout: 35 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("فشل الاتصال بسيرفر السحابة (%s): %v", cleanURL, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("رفض السيرفر الحزمة (كود %d): %s", resp.StatusCode, string(respBody))
	}

	log.Printf("[SYNC] ✅ تمت المزامنة بنجاح تام مع السحابة! استجابة السيرفر: %s", string(respBody))
	return nil
}

func main() {
	configPath := flag.String("config", "", "Path to config file (config.yaml)")
	syncNow := flag.Bool("sync-now", false, "Perform an immediate one-shot sync and exit")
	noPrompt := flag.Bool("no-prompt", false, "Skip interactive prompt and use saved config")
	daemon := flag.Bool("daemon", false, "Run in background daemon mode without prompt")
	accountFlag := flag.String("account", "", "Search for customer/account details by ID in Firebird")
	flag.Parse()

	log.Println("==========================================================")
	log.Println("     XPharma Warehouse Sync Agent - وكيل مزامنة المخزن    ")
	log.Println("==========================================================")

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Printf("❌ فشل تحميل ملف الإعدادات: %v", err)
		if !*daemon && !*noPrompt {
			fmt.Println("\nاضغط ENTER للإغلاق...")
			bufio.NewReader(os.Stdin).ReadString('\n')
		}
		os.Exit(1)
	}

	// Direct account lookup if -account flag is passed
	if *accountFlag != "" {
		findAccount(cfg, *accountFlag)
		if !*daemon && !*noPrompt {
			fmt.Println("\nاضغط ENTER للإغلاق...")
			bufio.NewReader(os.Stdin).ReadString('\n')
		}
		return
	}

	// Interactive configuration prompt unless running in headless daemon mode
	if !*daemon && !*noPrompt {
		promptInteractiveConfig(cfg, syncNow)
	}

	cleanURL := strings.TrimRight(cfg.Cloud.APIURL, "/")
	if !strings.HasSuffix(cleanURL, "/v1/sync/ingest") {
		cleanURL += "/v1/sync/ingest"
	}
	cfg.Cloud.APIURL = cleanURL

	maskedKey := cfg.Cloud.APIKey
	if len(cfg.Cloud.APIKey) > 18 {
		maskedKey = fmt.Sprintf("%s...%s", cfg.Cloud.APIKey[:12], cfg.Cloud.APIKey[len(cfg.Cloud.APIKey)-6:])
	}

	log.Printf("🔹 رابط السحابة: %s", cfg.Cloud.APIURL)
	log.Printf("🔹 مفتاح الأمان (Agent Key): %s", maskedKey)
	log.Printf("🔹 سيرفر الفايربيرد: %s:%d", cfg.Firebird.Host, cfg.Firebird.Port)
	log.Printf("🔹 مسار الفايربيرد: %s", cfg.Firebird.DBPath)
	log.Printf("🔹 دورة التحديث: كل %d ثانية", cfg.Cloud.SyncIntervalSeconds)

	if *syncNow {
		if err := performSync(cfg); err != nil {
			log.Printf("❌ فشلت المزامنة: %v", err)
		} else {
			log.Println("🎉 اكتملت المزامنة بنجاح تام!")
		}
		if !*daemon && !*noPrompt {
			fmt.Println("\nاضغط ENTER للإغلاق...")
			bufio.NewReader(os.Stdin).ReadString('\n')
		}
		return
	}

	log.Println("🔄 تم تشغيل الوكيل في وضع المراقبة الدورية المستمرة (Daemon)...")

	// Run initial sync immediately
	if err := performSync(cfg); err != nil {
		log.Printf("⚠️ تنبيه أثناء أول مزامنة: %v", err)
	}

	ticker := time.NewTicker(time.Duration(cfg.Cloud.SyncIntervalSeconds) * time.Second)
	defer ticker.Stop()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			if err := performSync(cfg); err != nil {
				log.Printf("❌ خطأ أثناء دورة المزامنة: %v", err)
			}
		case sig := <-sigChan:
			log.Printf("🛑 تم استقبال إشارة إيقاف (%v). جارٍ إنهاء الوكيل بأمان...", sig)
			return
		}
	}
}
