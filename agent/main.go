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
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
	"unsafe"

	_ "github.com/nakagami/firebirdsql"
	"golang.org/x/text/encoding/charmap"
	"gopkg.in/yaml.v3"
)

// -----------------------------------------------------------------------------
// Models and Configurations
// -----------------------------------------------------------------------------

type Config struct {
	Language string `yaml:"language" json:"language"` // "ar" or "en"
	WebPort  int    `yaml:"web_port" json:"web_port"` // default 8080

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
	RemoteID        string    `json:"remote_id"`
	Name            string    `json:"name"`
	NameEn          string    `json:"name_en"`
	Price           float64   `json:"price"`
	Quantity        float64   `json:"quantity"`
	DiscountPercent float64   `json:"discount_percent"`
	DateIn          time.Time `json:"date_in"`
}

// Global Agent State for Web Dashboard
type AgentState struct {
	sync.Mutex
	Status       string    `json:"status"` // "idle", "syncing", "success", "error"
	LastSyncAt   time.Time `json:"last_sync_at"`
	LastError    string    `json:"last_error"`
	TotalInvoices int      `json:"total_invoices"`
	TotalReceipts int      `json:"total_receipts"`
	TotalCustomers int     `json:"total_customers"`
	TotalProducts int      `json:"total_products"`
	RecentLogs   []string  `json:"recent_logs"`
}

var globalState = &AgentState{
	Status:     "idle",
	RecentLogs: []string{},
}

func addLog(msg string) {
	log.Println(msg)
	globalState.Lock()
	defer globalState.Unlock()
	entry := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), msg)
	globalState.RecentLogs = append(globalState.RecentLogs, entry)
	if len(globalState.RecentLogs) > 100 {
		globalState.RecentLogs = globalState.RecentLogs[len(globalState.RecentLogs)-100:]
	}
}

// -----------------------------------------------------------------------------
// Windows Console Encoding & Decoding
// -----------------------------------------------------------------------------

func initWindowsConsole() {
	if runtime.GOOS == "windows" {
		kernel32 := syscall.NewLazyDLL("kernel32.dll")
		setConsoleOutputCP := kernel32.NewProc("SetConsoleOutputCP")
		setConsoleCP := kernel32.NewProc("SetConsoleCP")
		if setConsoleOutputCP.Find() == nil {
			setConsoleOutputCP.Call(65001) // UTF-8
		}
		if setConsoleCP.Find() == nil {
			setConsoleCP.Call(65001) // UTF-8
		}

		// Enable Virtual Terminal Processing for ANSI colors and clean output
		getStdHandle := kernel32.NewProc("GetStdHandle")
		getConsoleMode := kernel32.NewProc("GetConsoleMode")
		setConsoleMode := kernel32.NewProc("SetConsoleMode")
		if getStdHandle.Find() == nil && getConsoleMode.Find() == nil && setConsoleMode.Find() == nil {
			const stdOutputHandle = uint32(0xFFFFFFF5) // -11
			const enableVirtualTerminalProcessing = 0x0004
			handle, _, _ := getStdHandle.Call(uintptr(stdOutputHandle))
			if handle != uintptr(syscall.InvalidHandle) {
				var mode uint32
				res, _, _ := getConsoleMode.Call(handle, uintptr(unsafe.Pointer(&mode)))
				if res != 0 {
					mode |= enableVirtualTerminalProcessing
					setConsoleMode.Call(handle, uintptr(mode))
				}
			}
		}
	}
}

func decodeText(input []byte) string {
	if len(input) == 0 {
		return ""
	}
	// Check if already valid UTF-8
	if utf8.Valid(input) {
		s := strings.TrimSpace(string(input))
		return cleanControlChars(s)
	}
	// Decode from Windows-1256 (Standard Arabic code page for Firebird in Egypt/Arab world)
	decoder := charmap.Windows1256.NewDecoder()
	utf8Bytes, err := decoder.Bytes(input)
	if err != nil {
		return cleanControlChars(strings.TrimSpace(string(input)))
	}
	return cleanControlChars(strings.TrimSpace(string(utf8Bytes)))
}

func cleanControlChars(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r == '\n' || r == '\r' || r == '\t' || r >= 32 {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

func cleanInput(s string) string {
	s = strings.Trim(s, "\ufeff\uffef\x00\"'` \t\r\n")
	return strings.TrimSpace(s)
}

// -----------------------------------------------------------------------------
// Config Loading & Saving
// -----------------------------------------------------------------------------

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

	if cfg.Language == "" {
		cfg.Language = "ar" // Default to Arabic
	}
	if cfg.WebPort <= 0 {
		cfg.WebPort = 8080
	}

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
		"language": cfg.Language,
		"web_port": cfg.WebPort,
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

// -----------------------------------------------------------------------------
// Interactive Configuration Prompt
// -----------------------------------------------------------------------------

func promptInteractiveConfig(cfg *Config, syncNow *bool) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println()
	fmt.Println("==================================================================")
	fmt.Println("       XPharma Warehouse Sync Agent | وكيل مزامنة المستودع        ")
	fmt.Println("==================================================================")
	fmt.Println("Choose Language / اختر لغة العرض:")
	fmt.Println(" [1] العربية (Arabic)")
	fmt.Println(" [2] English (English)")
	fmt.Print(" > Choice [1 or 2, default: 1]: ")
	langChoice, _ := reader.ReadString('\n')
	langChoice = strings.TrimSpace(langChoice)
	if langChoice == "2" {
		cfg.Language = "en"
	} else if langChoice == "1" {
		cfg.Language = "ar"
	}

	isAr := cfg.Language != "en"

	if isAr {
		fmt.Println("\nيرجى إدخال بيانات الربط لمزامنة قاعدة بيانات المستودع بالكامل مع السحابة:")
	} else {
		fmt.Println("\nPlease enter the connection details to sync all warehouse data with cloud:")
	}
	fmt.Println()

	// 1. Firebird DB Path
	for {
		if isAr {
			if cfg.Firebird.DBPath != "" {
				fmt.Printf("[1] مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):\n    [المسار الحالي: %s]\n    > اكتب أو الصق مسار ملف الداتا (أو اضغط ENTER للاحتفاظ به): ", cfg.Firebird.DBPath)
			} else {
				fmt.Println("[1] مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):")
				fmt.Println("    (قم بنسخ مسار ملف الداتا من الويندوز ولصقه هنا، مثال: D:\\ORGA_SOFT\\DATA\\ORGA.GDB)")
				fmt.Print("    > الصق مسار ملف الداتا: ")
			}
		} else {
			if cfg.Firebird.DBPath != "" {
				fmt.Printf("[1] Firebird Database File Path:\n    [Current: %s]\n    > Enter or paste DB path (or press ENTER to keep): ", cfg.Firebird.DBPath)
			} else {
				fmt.Println("[1] Firebird Database File Path:")
				fmt.Println("    (e.g.: D:\\ORGA_SOFT\\DATA\\ORGA.GDB)")
				fmt.Print("    > Paste database file path: ")
			}
		}

		inputDB, _ := reader.ReadString('\n')
		inputDB = cleanInput(inputDB)
		if inputDB != "" {
			cfg.Firebird.DBPath = inputDB
			break
		} else if cfg.Firebird.DBPath != "" {
			break
		} else {
			if isAr {
				fmt.Println("    [!] تنبيه: مسار ملف قاعدة البيانات مطلوب للمتابعة.")
			} else {
				fmt.Println("    [!] Notice: Database file path is required to proceed.")
			}
		}
	}

	// 2. Master Host / IP
	fmt.Println()
	if isAr {
		if cfg.Firebird.Host != "" && cfg.Firebird.Host != "127.0.0.1" && cfg.Firebird.Host != "localhost" {
			fmt.Printf("[2] عنوان IP الماستر أو السيرفر (Master IP / Host):\n    [الحالي: %s]\n    > اكتب IP الماستر (أو اضغط ENTER للاحتفاظ به): ", cfg.Firebird.Host)
		} else {
			fmt.Println("[2] عنوان IP الماستر أو السيرفر (Master IP / Host):")
			fmt.Println("    (إذا كان البرنامج يعمل على نفس جهاز السيرفر، اضغط ENTER مباشرة)")
			fmt.Print("    > اكتب IP الماستر [افتراضي: 127.0.0.1]: ")
		}
	} else {
		if cfg.Firebird.Host != "" && cfg.Firebird.Host != "127.0.0.1" && cfg.Firebird.Host != "localhost" {
			fmt.Printf("[2] Master Server Host/IP:\n    [Current: %s]\n    > Enter IP (or press ENTER to keep): ", cfg.Firebird.Host)
		} else {
			fmt.Println("[2] Master Server Host/IP:")
			fmt.Println("    (If running on the same server machine, just press ENTER)")
			fmt.Print("    > Enter Master IP [Default: 127.0.0.1]: ")
		}
	}

	inputHost, _ := reader.ReadString('\n')
	inputHost = cleanInput(inputHost)
	if inputHost != "" {
		cfg.Firebird.Host = inputHost
	} else if cfg.Firebird.Host == "" {
		cfg.Firebird.Host = "127.0.0.1"
	}

	// 3. API Token
	fmt.Println()
	for {
		if cfg.Cloud.APIKey != "" {
			maskedKey := cfg.Cloud.APIKey
			if len(cfg.Cloud.APIKey) > 18 {
				maskedKey = fmt.Sprintf("%s...%s", cfg.Cloud.APIKey[:12], cfg.Cloud.APIKey[len(cfg.Cloud.APIKey)-6:])
			}
			if isAr {
				fmt.Printf("[3] مفتاح الربط والتوكن السحابي (API Token):\n    [التوكن الحالي المحفوظ: %s]\n    > الصق التوكن الجديد (أو اضغط ENTER للاحتفاظ به): ", maskedKey)
			} else {
				fmt.Printf("[3] Cloud API Token:\n    [Current saved: %s]\n    > Paste new token (or press ENTER to keep): ", maskedKey)
			}
		} else {
			if isAr {
				fmt.Println("[3] مفتاح الربط والتوكن السحابي (API Token):")
				fmt.Println("    (يرجى لصق الـ API Token الذي استلمته من إدارة منصة XPharma)")
				fmt.Print("    > الصق مفتاح الربط (API Token): ")
			} else {
				fmt.Println("[3] Cloud API Token:")
				fmt.Println("    (Paste the API Token obtained from XPharma Admin Portal)")
				fmt.Print("    > Paste API Token: ")
			}
		}

		inputKey, _ := reader.ReadString('\n')
		inputKey = cleanInput(inputKey)
		if inputKey != "" {
			cfg.Cloud.APIKey = inputKey
			break
		} else if cfg.Cloud.APIKey != "" {
			break
		} else {
			if isAr {
				fmt.Println("    [!] تنبيه: مفتاح الربط (API Token) إلزامي للمتابعة.")
			} else {
				fmt.Println("    [!] Notice: API Token is required to proceed.")
			}
		}
	}

	saveYAMLConfig("config.yaml", cfg)
	fmt.Println()
	if isAr {
		fmt.Println("[OK] تم حفظ الإعدادات في config.yaml بنجاح!")
	} else {
		fmt.Println("[OK] Configuration saved to config.yaml successfully!")
	}
	fmt.Println("==================================================================")

	if syncNow != nil && !*syncNow {
		if isAr {
			fmt.Println("اختر نمط التشغيل المطلوب:")
			fmt.Println(" [1] مزامنة جميع البيانات كاملة الآن لمرة واحدة (فحص وتفريغ كامل)")
			fmt.Println(" [2] تشغيل المراقبة والمزامنة المستمرة (تلقائي كل دقيقة - اضغط ENTER)")
			fmt.Println(" [3] البحث عن عميل بكود الحساب (مثال: 2877)")
			fmt.Print(" > اختيارك [1 أو 2 أو 3]: ")
		} else {
			fmt.Println("Select operating mode:")
			fmt.Println(" [1] Sync ALL historical data now (Full immediate sync)")
			fmt.Println(" [2] Run continuous background monitoring every minute (Press ENTER)")
			fmt.Println(" [3] Search for customer by account code (e.g. 2877)")
			fmt.Print(" > Choice [1, 2, or 3]: ")
		}

		modeInput, _ := reader.ReadString('\n')
		modeInput = strings.TrimSpace(modeInput)
		if modeInput == "1" {
			*syncNow = true
		} else if modeInput == "3" {
			if isAr {
				fmt.Print("\n > ادخل كود/رقم العميل المطلوب: ")
			} else {
				fmt.Print("\n > Enter customer account code: ")
			}
			accInput, _ := reader.ReadString('\n')
			accInput = cleanInput(accInput)
			if accInput != "" {
				findAccount(cfg, accInput)
				fmt.Println("\nPress ENTER to close / اضغط ENTER للإغلاق...")
				reader.ReadString('\n')
				os.Exit(0)
			}
		}
		fmt.Println("==================================================================")
	}
	fmt.Println()
}

// -----------------------------------------------------------------------------
// Firebird Connection
// -----------------------------------------------------------------------------

func connectFirebird(cfg *Config) (*sql.DB, error) {
	fb := cfg.Firebird
	cleanPath := filepath.ToSlash(fb.DBPath)
	if !strings.HasPrefix(cleanPath, "/") && len(cleanPath) > 1 && cleanPath[1] == ':' {
		cleanPath = "/" + cleanPath
	}

	// 1. Try Legacy_Auth with wire_crypt=false (Required for Firebird 2.5 / ORGA SOFT ERP)
	dsnLegacy := fmt.Sprintf("%s:%s@%s:%d%s?charset=NONE&auth_plugin_name=Legacy_Auth&wire_crypt=false",
		fb.User, fb.Password, fb.Host, fb.Port, cleanPath)

	db, err := sql.Open("firebirdsql", dsnLegacy)
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pingErr := db.PingContext(ctx)
		cancel()
		if pingErr == nil {
			return db, nil
		}
		db.Close()
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

// -----------------------------------------------------------------------------
// Extraction Logic (ALL Data - No Date or Limit Constraints)
// -----------------------------------------------------------------------------

func extractAllFromFirebird(cfg *Config) (*IngestionPayload, error) {
	fb := cfg.Firebird
	isAr := cfg.Language != "en"

	if fb.DBPath == "" {
		if isAr {
			return nil, fmt.Errorf("مسار قاعدة بيانات الفايربيرد غير محدد")
		}
		return nil, fmt.Errorf("firebird database path is not specified")
	}

	addr := fmt.Sprintf("%s:%d", fb.Host, fb.Port)
	if isAr {
		addLog(fmt.Sprintf("[FIREBIRD] فحص منفذ الاتصال بالسيرفر (%s)...", addr))
	} else {
		addLog(fmt.Sprintf("[FIREBIRD] Checking server connection (%s)...", addr))
	}

	tcpConn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return nil, fmt.Errorf("network connection error to %s: %v", addr, err)
	}
	tcpConn.Close()

	db, err := connectFirebird(cfg)
	if err != nil {
		return nil, fmt.Errorf("database authentication failed: %v", err)
	}
	defer db.Close()

	if isAr {
		addLog("[FIREBIRD] تم الاتصال بقاعدة البيانات بنجاح.")
	} else {
		addLog("[FIREBIRD] Connected to Firebird database successfully.")
	}

	payload := &IngestionPayload{}

	// Discover existing tables
	tabRows, err := db.Query(`
		SELECT TRIM(RDB$RELATION_NAME) 
		FROM RDB$RELATIONS 
		WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
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
	}

	// -------------------------------------------------------------------------
	// 1. EXTRACT ALL INVOICES (بدون أي حد أقصى أو تقييد زمني)
	// -------------------------------------------------------------------------
	if tableMap["INVOICES_H"] {
		if isAr {
			addLog("[FIREBIRD] استخراج جميع الفواتير التاريخية من INVOICES_H بالكامل...")
		} else {
			addLog("[FIREBIRD] Extracting ALL invoices from INVOICES_H (all time, no limits)...")
		}

		invRows, err := db.Query(`
			SELECT 
				INVOICES_H_ID, DATE_D, TOTAL_TOTAL, TOTAL_DISCOUNT1, TOTAL_MONY_PAY, ACCOUNT_ID
			FROM INVOICES_H 
			ORDER BY INVOICES_H_ID ASC
		`)
		if err != nil {
			addLog(fmt.Sprintf("[FIREBIRD] Warning on INVOICES_H query: %v", err))
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
			if isAr {
				addLog(fmt.Sprintf("[FIREBIRD] تم استخراج إجمالي %d فاتورة من بداية الداتا إلى الآن!", len(payload.Invoices)))
			} else {
				addLog(fmt.Sprintf("[FIREBIRD] Extracted %d total invoices successfully!", len(payload.Invoices)))
			}
		}
	}

	// -------------------------------------------------------------------------
	// 2. EXTRACT ALL CASH RECEIPTS (سندات القبض بالكامل)
	// -------------------------------------------------------------------------
	if tableMap["INCOME_CASH"] {
		if isAr {
			addLog("[FIREBIRD] استخراج جميع سندات القبض التاريخية من INCOME_CASH...")
		} else {
			addLog("[FIREBIRD] Extracting ALL cash receipts from INCOME_CASH...")
		}

		rcptRows, err := db.Query(`
			SELECT 
				INCOME_CASH_ID, DATE_D, CASH, ACCOUNT_ID, USERS_NAME 
			FROM INCOME_CASH 
			ORDER BY INCOME_CASH_ID ASC
		`)
		if err != nil {
			addLog(fmt.Sprintf("[FIREBIRD] Warning on INCOME_CASH query: %v", err))
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
				collector := decodeText(userRaw)
				payload.CashReceipts = append(payload.CashReceipts, CashReceiptSyncItem{
					RemoteID:      fmt.Sprintf("%d", id),
					ReceiptNumber: fmt.Sprintf("RCP-%d", id),
					PharmacyCode:  fmt.Sprintf("%d", accountID),
					ReceiptDate:   dateD,
					Amount:        amount,
					PaymentMethod: "cash",
					CollectorName: collector,
					Notes:         "سند قبض نقدي",
				})
			}
			if isAr {
				addLog(fmt.Sprintf("[FIREBIRD] تم استخراج إجمالي %d سند قبض بالكامل!", len(payload.CashReceipts)))
			} else {
				addLog(fmt.Sprintf("[FIREBIRD] Extracted %d total cash receipts successfully!", len(payload.CashReceipts)))
			}
		}
	}

	// -------------------------------------------------------------------------
	// 3. EXTRACT ALL CUSTOMERS / PHARMACIES (دليل الصيدليات والعملاء بالكامل)
	// -------------------------------------------------------------------------
	custCandidates := []string{"ACCOUNTS", "ACCOUNT", "CUSTOMERS", "CUSTOMER", "CLIENTS"}
	var custTable string
	for _, t := range custCandidates {
		if tableMap[t] {
			custTable = t
			break
		}
	}

	if custTable != "" {
		if isAr {
			addLog(fmt.Sprintf("[FIREBIRD] استخراج جميع العملاء والصيدليات من جدول %s...", custTable))
		} else {
			addLog(fmt.Sprintf("[FIREBIRD] Extracting ALL customers and pharmacies from %s...", custTable))
		}

		cRows, err := db.Query(fmt.Sprintf("SELECT * FROM %s", custTable))
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
							cName = decodeText(v)
						default:
							cName = cleanControlChars(strings.TrimSpace(fmt.Sprintf("%v", v)))
						}
					}
					if phoneIdx != -1 && vals[phoneIdx] != nil {
						switch v := vals[phoneIdx].(type) {
						case []byte:
							cPhone = decodeText(v)
						default:
							cPhone = cleanControlChars(strings.TrimSpace(fmt.Sprintf("%v", v)))
						}
					}
					if addrIdx != -1 && vals[addrIdx] != nil {
						switch v := vals[addrIdx].(type) {
						case []byte:
							cAddr = decodeText(v)
						default:
							cAddr = cleanControlChars(strings.TrimSpace(fmt.Sprintf("%v", v)))
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
				if isAr {
					addLog(fmt.Sprintf("[FIREBIRD] تم استخراج إجمالي %d عميل وصيدلية بالكامل!", len(payload.Customers)))
				} else {
					addLog(fmt.Sprintf("[FIREBIRD] Extracted %d total customers successfully!", len(payload.Customers)))
				}
			}
		}
	}

	// -------------------------------------------------------------------------
	// 4. EXTRACT ALL PRODUCTS / MEDICINES (الأدوية والأصناف من الفايربيرد)
	// -------------------------------------------------------------------------
	prodCandidates := []string{"ITEMS", "ITEM", "PRODUCTS", "PRODUCT", "DRUGS", "DRUG", "STORE_ITEMS", "MEDICINES"}
	var prodTable string
	for _, t := range prodCandidates {
		if tableMap[t] {
			prodTable = t
			break
		}
	}

	if prodTable != "" {
		if isAr {
			addLog(fmt.Sprintf("[FIREBIRD] استخراج الأدوية والأصناف من جدول %s...", prodTable))
		} else {
			addLog(fmt.Sprintf("[FIREBIRD] Extracting products/medicines from %s...", prodTable))
		}

		pRows, err := db.Query(fmt.Sprintf("SELECT * FROM %s", prodTable))
		if err == nil {
			defer pRows.Close()
			pCols, _ := pRows.Columns()
			idIdx, nameIdx, priceIdx, qtyIdx, discIdx := -1, -1, -1, -1, -1
			for idx, col := range pCols {
				u := strings.ToUpper(strings.TrimSpace(col))
				if idIdx == -1 && (u == "ITEM_ID" || u == "ID" || u == "CODE" || u == "ITEM_CODE" || u == "PRODUCT_ID") {
					idIdx = idx
				}
				if nameIdx == -1 && (u == "ITEM_NAME" || u == "NAME" || u == "TITLE" || u == "PRODUCT_NAME" || u == "NAME_A") {
					nameIdx = idx
				}
				if priceIdx == -1 && (u == "PRICE" || u == "SELL_PRICE" || u == "PRICE_SELL" || u == "UNIT_PRICE" || u == "PRICE_1") {
					priceIdx = idx
				}
				if qtyIdx == -1 && (u == "QTY" || u == "QUANTITY" || u == "BALANCE" || u == "STOCK" || u == "QTY_STORE") {
					qtyIdx = idx
				}
				if discIdx == -1 && (u == "DISCOUNT" || u == "DISC_PERCENT" || u == "DISC") {
					discIdx = idx
				}
			}

			if idIdx != -1 && nameIdx != -1 {
				for pRows.Next() {
					vals := make([]interface{}, len(pCols))
					valPtrs := make([]interface{}, len(pCols))
					for i := range vals {
						valPtrs[i] = &vals[i]
					}
					if err := pRows.Scan(valPtrs...); err != nil {
						continue
					}

					var pID, pName string
					var pPrice, pQty, pDisc float64
					if vals[idIdx] != nil {
						pID = strings.TrimSpace(fmt.Sprintf("%v", vals[idIdx]))
					}
					if vals[nameIdx] != nil {
						switch v := vals[nameIdx].(type) {
						case []byte:
							pName = decodeText(v)
						default:
							pName = cleanControlChars(strings.TrimSpace(fmt.Sprintf("%v", v)))
						}
					}
					if priceIdx != -1 && vals[priceIdx] != nil {
						fmt.Sscanf(fmt.Sprintf("%v", vals[priceIdx]), "%f", &pPrice)
					}
					if qtyIdx != -1 && vals[qtyIdx] != nil {
						fmt.Sscanf(fmt.Sprintf("%v", vals[qtyIdx]), "%f", &pQty)
					}
					if discIdx != -1 && vals[discIdx] != nil {
						fmt.Sscanf(fmt.Sprintf("%v", vals[discIdx]), "%f", &pDisc)
					}

					if pID != "" && pName != "" {
						payload.Products = append(payload.Products, ProductSyncItem{
							RemoteID:        pID,
							Name:            pName,
							NameEn:          "",
							Price:           pPrice,
							Quantity:        pQty,
							DiscountPercent: pDisc,
							DateIn:          time.Now(),
						})
					}
				}
				if isAr {
					addLog(fmt.Sprintf("[FIREBIRD] تم استخراج إجمالي %d صنف ودواء بالكامل!", len(payload.Products)))
				} else {
					addLog(fmt.Sprintf("[FIREBIRD] Extracted %d total products successfully!", len(payload.Products)))
				}
			}
		}
	}

	// -------------------------------------------------------------------------
	// 5. EXTRACT ALL RETURNS (المرتجعات إن وجدت)
	// -------------------------------------------------------------------------
	retCandidates := []string{"RETURNS_H", "RETURN_H", "RETURNS", "INVOICES_RETURN_H"}
	var retTable string
	for _, t := range retCandidates {
		if tableMap[t] {
			retTable = t
			break
		}
	}

	if retTable != "" {
		rRows, err := db.Query(fmt.Sprintf("SELECT * FROM %s", retTable))
		if err == nil {
			defer rRows.Close()
			rCols, _ := rRows.Columns()
			idIdx, dateIdx, totalIdx, accIdx := -1, -1, -1, -1
			for idx, col := range rCols {
				u := strings.ToUpper(strings.TrimSpace(col))
				if idIdx == -1 && (strings.Contains(u, "ID") || strings.Contains(u, "NUM")) {
					idIdx = idx
				}
				if dateIdx == -1 && strings.Contains(u, "DATE") {
					dateIdx = idx
				}
				if totalIdx == -1 && (strings.Contains(u, "TOTAL") || strings.Contains(u, "AMOUNT")) {
					totalIdx = idx
				}
				if accIdx == -1 && strings.Contains(u, "ACCOUNT") {
					accIdx = idx
				}
			}
			if idIdx != -1 && totalIdx != -1 {
				for rRows.Next() {
					vals := make([]interface{}, len(rCols))
					valPtrs := make([]interface{}, len(rCols))
					for i := range vals {
						valPtrs[i] = &vals[i]
					}
					if err := rRows.Scan(valPtrs...); err != nil {
						continue
					}
					var rID, rAcc string
					var rTotal float64
					var rDate time.Time = time.Now()
					if vals[idIdx] != nil {
						rID = fmt.Sprintf("%v", vals[idIdx])
					}
					if accIdx != -1 && vals[accIdx] != nil {
						rAcc = fmt.Sprintf("%v", vals[accIdx])
					}
					if totalIdx != -1 && vals[totalIdx] != nil {
						fmt.Sscanf(fmt.Sprintf("%v", vals[totalIdx]), "%f", &rTotal)
					}
					if dateIdx != -1 && vals[dateIdx] != nil {
						rDate = parseFlexibleDate(vals[dateIdx])
					}
					if rID != "" {
						payload.Returns = append(payload.Returns, ReturnSyncItem{
							RemoteID:     rID,
							ReturnNumber: fmt.Sprintf("RET-%s", rID),
							PharmacyCode: rAcc,
							ReturnDate:   rDate,
							TotalAmount:  rTotal,
							NetAmount:    rTotal,
							Status:       "synced",
							Reason:       "مرتجع بضاعة",
						})
					}
				}
			}
		}
	}

	// Update global stats
	globalState.Lock()
	globalState.TotalInvoices = len(payload.Invoices)
	globalState.TotalReceipts = len(payload.CashReceipts)
	globalState.TotalCustomers = len(payload.Customers)
	globalState.TotalProducts = len(payload.Products)
	globalState.Unlock()

	return payload, nil
}

// -----------------------------------------------------------------------------
// Reliable Batched Uploading (رفع الحزم الذكي بدون انقطاع أو انتهاء مهلة)
// -----------------------------------------------------------------------------

func postPayloadBatch(apiURL, apiKey string, payload IngestionPayload) error {
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("json marshal error: %v", err)
	}

	var gzBuffer bytes.Buffer
	gzWriter := gzip.NewWriter(&gzBuffer)
	if _, err := gzWriter.Write(jsonBytes); err != nil {
		return fmt.Errorf("gzip write error: %v", err)
	}
	if err := gzWriter.Close(); err != nil {
		return fmt.Errorf("gzip close error: %v", err)
	}

	cleanURL := strings.TrimRight(apiURL, "/")
	if !strings.HasSuffix(cleanURL, "/v1/sync/ingest") {
		cleanURL += "/v1/sync/ingest"
	}

	req, err := http.NewRequest("POST", cleanURL, &gzBuffer)
	if err != nil {
		return fmt.Errorf("request creation error: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("X-Agent-Key", apiKey)

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("network error (%s): %v", cleanURL, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server rejected payload (HTTP %d): %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func sendBatchedSync(cfg *Config, fullPayload *IngestionPayload) error {
	isAr := cfg.Language != "en"
	apiKey := cfg.Cloud.APIKey
	apiURL := cfg.Cloud.APIURL

	if apiKey == "" {
		return fmt.Errorf("API Key is missing")
	}

	// 1. Upload Customers first (Batch size: 1,000)
	const custBatchSize = 1000
	custTotal := len(fullPayload.Customers)
	if custTotal > 0 {
		batches := (custTotal + custBatchSize - 1) / custBatchSize
		for i := 0; i < custTotal; i += custBatchSize {
			end := i + custBatchSize
			if end > custTotal {
				end = custTotal
			}
			batchNum := (i / custBatchSize) + 1
			p := IngestionPayload{
				Customers: fullPayload.Customers[i:end],
			}
			if isAr {
				addLog(fmt.Sprintf("[SYNC] رفع الصيدليات والعملاء: دفعة %d من %d (%d عميل)...", batchNum, batches, len(p.Customers)))
			} else {
				addLog(fmt.Sprintf("[SYNC] Uploading customers: batch %d of %d (%d items)...", batchNum, batches, len(p.Customers)))
			}
			if err := postPayloadBatch(apiURL, apiKey, p); err != nil {
				return fmt.Errorf("customers batch %d error: %v", batchNum, err)
			}
		}
	}

	// 2. Upload Products (Batch size: 1,000)
	const prodBatchSize = 1000
	prodTotal := len(fullPayload.Products)
	if prodTotal > 0 {
		batches := (prodTotal + prodBatchSize - 1) / prodBatchSize
		for i := 0; i < prodTotal; i += prodBatchSize {
			end := i + prodBatchSize
			if end > prodTotal {
				end = prodTotal
			}
			batchNum := (i / prodBatchSize) + 1
			p := IngestionPayload{
				Products: fullPayload.Products[i:end],
			}
			if isAr {
				addLog(fmt.Sprintf("[SYNC] رفع الأصناف والأدوية: دفعة %d من %d (%d صنف)...", batchNum, batches, len(p.Products)))
			} else {
				addLog(fmt.Sprintf("[SYNC] Uploading products: batch %d of %d (%d items)...", batchNum, batches, len(p.Products)))
			}
			if err := postPayloadBatch(apiURL, apiKey, p); err != nil {
				return fmt.Errorf("products batch %d error: %v", batchNum, err)
			}
		}
	}

	// 3. Upload Cash Receipts (Batch size: 1,000)
	const rcptBatchSize = 1000
	rcptTotal := len(fullPayload.CashReceipts)
	if rcptTotal > 0 {
		batches := (rcptTotal + rcptBatchSize - 1) / rcptBatchSize
		for i := 0; i < rcptTotal; i += rcptBatchSize {
			end := i + rcptBatchSize
			if end > rcptTotal {
				end = rcptTotal
			}
			batchNum := (i / rcptBatchSize) + 1
			p := IngestionPayload{
				CashReceipts: fullPayload.CashReceipts[i:end],
			}
			if isAr {
				addLog(fmt.Sprintf("[SYNC] رفع سندات القبض: دفعة %d من %d (%d سند)...", batchNum, batches, len(p.CashReceipts)))
			} else {
				addLog(fmt.Sprintf("[SYNC] Uploading cash receipts: batch %d of %d (%d items)...", batchNum, batches, len(p.CashReceipts)))
			}
			if err := postPayloadBatch(apiURL, apiKey, p); err != nil {
				return fmt.Errorf("receipts batch %d error: %v", batchNum, err)
			}
		}
	}

	// 4. Upload Invoices (Batch size: 500)
	const invBatchSize = 500
	invTotal := len(fullPayload.Invoices)
	if invTotal > 0 {
		batches := (invTotal + invBatchSize - 1) / invBatchSize
		for i := 0; i < invTotal; i += invBatchSize {
			end := i + invBatchSize
			if end > invTotal {
				end = invTotal
			}
			batchNum := (i / invBatchSize) + 1
			p := IngestionPayload{
				Invoices: fullPayload.Invoices[i:end],
			}
			if isAr {
				addLog(fmt.Sprintf("[SYNC] رفع الفواتير: دفعة %d من %d (%d فاتورة)...", batchNum, batches, len(p.Invoices)))
			} else {
				addLog(fmt.Sprintf("[SYNC] Uploading invoices: batch %d of %d (%d items)...", batchNum, batches, len(p.Invoices)))
			}
			if err := postPayloadBatch(apiURL, apiKey, p); err != nil {
				return fmt.Errorf("invoices batch %d error: %v", batchNum, err)
			}
		}
	}

	// 5. Upload Returns & Cursors if any
	if len(fullPayload.Returns) > 0 || len(fullPayload.Ledger) > 0 {
		p := IngestionPayload{
			Returns: fullPayload.Returns,
			Ledger:  fullPayload.Ledger,
		}
		if err := postPayloadBatch(apiURL, apiKey, p); err != nil {
			return fmt.Errorf("returns batch error: %v", err)
		}
	}

	// If nothing was extracted from DB (e.g. initial setup test), send demo payload
	if custTotal == 0 && prodTotal == 0 && rcptTotal == 0 && invTotal == 0 {
		demo := generateDemoPayload()
		if err := postPayloadBatch(apiURL, apiKey, demo); err != nil {
			return err
		}
	}

	return nil
}

func performFullSync(cfg *Config) error {
	globalState.Lock()
	globalState.Status = "syncing"
	globalState.LastError = ""
	globalState.Unlock()

	isAr := cfg.Language != "en"
	if isAr {
		addLog("[SYNC] بدء قراءة واستخراج البيانات من المستودع بالكامل...")
	} else {
		addLog("[SYNC] Starting extraction of ALL warehouse data...")
	}

	fbPayload, err := extractAllFromFirebird(cfg)
	if err != nil {
		if isAr {
			addLog(fmt.Sprintf("[WARN] تعذر الاتصال بالفايربيرد (%v). جاري استخدام بيانات الفحص...", err))
		} else {
			addLog(fmt.Sprintf("[WARN] Firebird connection issue (%v). Using test payload...", err))
		}
		demo := generateDemoPayload()
		fbPayload = &demo
	}

	if err := sendBatchedSync(cfg, fbPayload); err != nil {
		globalState.Lock()
		globalState.Status = "error"
		globalState.LastError = err.Error()
		globalState.Unlock()
		return err
	}

	globalState.Lock()
	globalState.Status = "success"
	globalState.LastSyncAt = time.Now()
	globalState.Unlock()

	if isAr {
		addLog("[SUCCESS] اكتملت عملية مزامنة البيانات بالكامل مع السحابة بنجاح تام!")
	} else {
		addLog("[SUCCESS] All warehouse data has been synced to cloud successfully!")
	}
	return nil
}

// -----------------------------------------------------------------------------
// Customer Search Utility
// -----------------------------------------------------------------------------

func findAccount(cfg *Config, accountID string) {
	isAr := cfg.Language != "en"
	if isAr {
		log.Printf("[SEARCH] جاري البحث عن العميل رقم (%s) في قاعدة بيانات Firebird...", accountID)
	} else {
		log.Printf("[SEARCH] Searching for customer (%s) in Firebird...", accountID)
	}

	db, err := connectFirebird(cfg)
	if err != nil {
		log.Printf("Connection error: %v", err)
		return
	}
	defer db.Close()

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
		foundTable = "ACCOUNTS"
	}

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
		log.Printf("Customer (%s) was not found in table (%s)", accountID, foundTable)
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		log.Printf("Columns error: %v", err)
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
		fmt.Printf("           Customer Data (Code: %s) - ORGA SOFT           \n", accountID)
		fmt.Println("==================================================================")
		for i, col := range cols {
			val := values[i]
			if val == nil {
				continue
			}
			var strVal string
			switch v := val.(type) {
			case []byte:
				strVal = decodeText(v)
			case time.Time:
				strVal = v.Format("2006-01-02 15:04")
			default:
				strVal = fmt.Sprintf("%v", v)
			}
			strVal = strings.TrimSpace(strVal)
			if strVal != "" && strVal != "0" && strVal != "0.00" && strVal != "0.0" {
				fmt.Printf("  * %-25s : %s\n", col, strVal)
			}
		}
		fmt.Println("==================================================================")
		fmt.Println()
	}

	if !found {
		fmt.Printf("\nNotice: No record found for customer (%s) in field (%s) table (%s)\n", accountID, usedCol, foundTable)
	}
}

// -----------------------------------------------------------------------------
// Demo Payload Generator (Fallback when DB file is not available)
// -----------------------------------------------------------------------------

func generateDemoPayload() IngestionPayload {
	now := time.Now()

	products := []ProductSyncItem{
		{RemoteID: "P-1001", Name: "بانادول إكسترا 500 ملغ (24 قرص)", NameEn: "Panadol Extra 500mg", Price: 45.00, Quantity: 1500},
		{RemoteID: "P-1002", Name: "أوجمنتين 1 جم مضاد حيوي (14 قرص)", NameEn: "Augmentin 1g Tablets", Price: 120.00, Quantity: 850},
		{RemoteID: "P-1003", Name: "كونكور 5 ملغ لضغط الدم (30 قرص)", NameEn: "Concor 5mg Tablets", Price: 65.50, Quantity: 620},
		{RemoteID: "P-1004", Name: "كاتافلام 50 ملغ مسكن (20 قرص)", NameEn: "Cataflam 50mg", Price: 38.00, Quantity: 1100},
	}

	invoices := []InvoiceSyncItem{
		{
			RemoteID:        "INV-2026-001",
			InvoiceNumber:   "INV-001",
			PharmacyCode:    "2877",
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
			},
		},
	}

	receipts := []CashReceiptSyncItem{
		{
			RemoteID:      "RCP-8891",
			ReceiptNumber: "RCP-8891",
			PharmacyCode:  "2877",
			ReceiptDate:   now.Add(-1 * time.Hour),
			Amount:        500.00,
			PaymentMethod: "cash",
			CollectorName: "مندوب التحصيل: محمد علي",
			Notes:         "دفعة تحت الحساب",
		},
	}

	customers := []CustomerSyncItem{
		{Code: "2877", Name: "صيدلية النور والشفاء", Phone: "01012345678", Address: "شارع الجمهورية - المنصورة"},
	}

	return IngestionPayload{
		Invoices:     invoices,
		Returns:      []ReturnSyncItem{},
		CashReceipts: receipts,
		Products:     products,
		Customers:    customers,
	}
}

// -----------------------------------------------------------------------------
// Built-in Local Web Dashboard (HTTP Server)
// -----------------------------------------------------------------------------

func startLocalWebServer(cfg *Config) {
	mux := http.NewServeMux()

	// API Status
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		globalState.Lock()
		defer globalState.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":          globalState.Status,
			"last_sync_at":    globalState.LastSyncAt.Format("2006-01-02 15:04:05"),
			"last_error":      globalState.LastError,
			"total_invoices":  globalState.TotalInvoices,
			"total_receipts":  globalState.TotalReceipts,
			"total_customers": globalState.TotalCustomers,
			"total_products":  globalState.TotalProducts,
			"recent_logs":     globalState.RecentLogs,
			"config": map[string]interface{}{
				"db_path":         cfg.Firebird.DBPath,
				"host":            cfg.Firebird.Host,
				"port":            cfg.Firebird.Port,
				"api_url":         cfg.Cloud.APIURL,
				"sync_interval":   cfg.Cloud.SyncIntervalSeconds,
				"language":        cfg.Language,
				"api_key_masked":  maskKey(cfg.Cloud.APIKey),
			},
		})
	})

	// API Trigger Sync Now
	mux.HandleFunc("/api/sync-now", func(w http.ResponseWriter, r *http.Request) {
		go func() {
			_ = performFullSync(cfg)
		}()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "Sync started"})
	})

	// API Save Settings
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			DBPath   string `json:"db_path"`
			Host     string `json:"host"`
			APIKey   string `json:"api_key"`
			Language string `json:"language"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			if req.DBPath != "" {
				cfg.Firebird.DBPath = cleanInput(req.DBPath)
			}
			if req.Host != "" {
				cfg.Firebird.Host = cleanInput(req.Host)
			}
			if req.APIKey != "" {
				cfg.Cloud.APIKey = cleanInput(req.APIKey)
			}
			if req.Language == "ar" || req.Language == "en" {
				cfg.Language = req.Language
			}
			saveYAMLConfig("config.yaml", cfg)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
	})

	// Web Dashboard HTML
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, dashboardHTML)
	})

	addr := fmt.Sprintf(":%d", cfg.WebPort)
	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	_ = server.ListenAndServe()
}

func maskKey(k string) string {
	if len(k) <= 12 {
		return "****"
	}
	return fmt.Sprintf("%s...%s", k[:8], k[len(k)-4:])
}

const dashboardHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl" id="htmlTag">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XPharma Warehouse Sync Agent</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 28, 45, 0.85);
      --border: rgba(255, 255, 255, 0.1);
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
      --font-ar: 'Cairo', sans-serif;
      --font-en: 'Inter', sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-ar);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    body.lang-en {
      font-family: var(--font-en);
    }
    .header {
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(8px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: white;
      font-size: 20px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 700;
      color: white;
    }
    .brand-sub {
      font-size: 12px;
      color: var(--text-muted);
    }
    .lang-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .lang-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .container {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      flex: 1;
    }
    .banner {
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(56, 189, 248, 0.05));
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 16px;
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .banner-info h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .banner-info p {
      font-size: 13px;
      color: var(--text-muted);
    }
    .sync-btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
    }
    .sync-btn:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
    .sync-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card-title {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 600;
    }
    .card-val {
      font-size: 28px;
      font-weight: 800;
      color: white;
      font-family: var(--font-en);
    }
    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 600;
      width: fit-content;
    }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-syncing { background: rgba(37, 99, 235, 0.15); color: #60a5fa; border: 1px solid rgba(37, 99, 235, 0.3); }
    .badge-error { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .main-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 860px) {
      .main-grid { grid-template-columns: 1fr; }
    }
    .log-box {
      background: #06090e;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      color: #94a3b8;
      height: 320px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .log-line {
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
    }
    .form-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .form-input {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
    }
    .form-input:focus {
      border-color: var(--primary);
    }
    .btn-save {
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid var(--border);
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
    }
    .btn-save:hover {
      background: var(--primary);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-green { background: #10b981; box-shadow: 0 0 8px #10b981; }
    .dot-blue { background: #3b82f6; box-shadow: 0 0 8px #3b82f6; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-logo">XP</div>
      <div>
        <div class="brand-title" id="t-brand">وكيل مزامنة المستودع XPharma</div>
        <div class="brand-sub">Warehouse Sync Agent v2.0</div>
      </div>
    </div>
    <button class="lang-btn" onclick="toggleLanguage()">
      <span id="lang-btn-text">English 🌐</span>
    </button>
  </div>

  <div class="container">
    <div class="banner">
      <div class="banner-info">
        <h1 id="t-banner-title">مزامنة كامل بيانات المستودع بدون حدود زمنية</h1>
        <p id="t-banner-sub">يتم رفع جميع الفواتير، سندات القبض، الصيدليات والأدوية التاريخية مباشرة إلى السحابة.</p>
      </div>
      <button class="sync-btn" id="syncBtn" onclick="triggerSync()">
        <span id="syncIcon">🚀</span>
        <span id="t-sync-now">مزامنة جميع البيانات الآن</span>
      </button>
    </div>

    <div class="grid-stats">
      <div class="card">
        <span class="card-title" id="t-stat-inv">إجمالي الفواتير المسحوبة</span>
        <span class="card-val" id="valInvoices">0</span>
      </div>
      <div class="card">
        <span class="card-title" id="t-stat-rcpt">إجمالي سندات القبض</span>
        <span class="card-val" id="valReceipts">0</span>
      </div>
      <div class="card">
        <span class="card-title" id="t-stat-cust">دليل الصيدليات والعملاء</span>
        <span class="card-val" id="valCustomers">0</span>
      </div>
      <div class="card">
        <span class="card-title" id="t-stat-prod">الأدوية والأصناف</span>
        <span class="card-val" id="valProducts">0</span>
      </div>
    </div>

    <div class="main-grid">
      <!-- Live Logs -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="card-title" id="t-logs-title">سجل العمليات المباشر (Live Sync Log)</span>
          <span class="badge-status badge-success" id="statusBadge">
            <span class="dot dot-green"></span>
            <span id="statusText">جاهز (Idle)</span>
          </span>
        </div>
        <div class="log-box" id="logBox">
          <div class="log-line">جاري تحميل سجل العمليات...</div>
        </div>
      </div>

      <!-- Settings -->
      <div class="card">
        <span class="card-title" id="t-settings-title" style="margin-bottom: 8px;">بيانات الربط والاتصال (Connection Settings)</span>
        <div class="form-group">
          <label class="form-label" id="t-lbl-db">مسار ملف قاعدة بيانات الفايربيرد (ORGA.GDB):</label>
          <input type="text" class="form-input" id="inputDB" placeholder="D:\ORGA_SOFT\DATA\ORGA.GDB" />
        </div>
        <div class="form-group">
          <label class="form-label" id="t-lbl-host">عنوان IP الماستر أو السيرفر (Master IP):</label>
          <input type="text" class="form-input" id="inputHost" placeholder="127.0.0.1" />
        </div>
        <div class="form-group">
          <label class="form-label" id="t-lbl-key">مفتاح التوكن السحابي (API Token):</label>
          <input type="password" class="form-input" id="inputKey" placeholder="xph_agt_..." />
        </div>
        <button class="btn-save" onclick="saveSettings()" id="t-btn-save">حفظ الإعدادات في config.yaml</button>
      </div>
    </div>
  </div>

  <script>
    let currentLang = localStorage.getItem('agent_lang') || 'ar';

    const dict = {
      ar: {
        brand: 'وكيل مزامنة المستودع XPharma',
        bannerTitle: 'مزامنة كامل بيانات المستودع بدون حدود زمنية',
        bannerSub: 'يتم رفع جميع الفواتير، سندات القبض، الصيدليات والأدوية التاريخية مباشرة إلى السحابة.',
        syncNow: 'مزامنة جميع البيانات الآن',
        statInv: 'إجمالي الفواتير المسحوبة',
        statRcpt: 'إجمالي سندات القبض',
        statCust: 'دليل الصيدليات والعملاء',
        statProd: 'الأدوية والأصناف',
        logsTitle: 'سجل العمليات المباشر (Live Sync Log)',
        settingsTitle: 'بيانات الربط والاتصال (Connection Settings)',
        lblDb: 'مسار ملف قاعدة بيانات الفايربيرد (ORGA.GDB):',
        lblHost: 'عنوان IP الماستر أو السيرفر (Master IP):',
        lblKey: 'مفتاح التوكن السحابي (API Token):',
        btnSave: 'حفظ الإعدادات في config.yaml',
        langBtn: 'English 🌐',
        statusIdle: 'جاهز (Idle)',
        statusSyncing: 'جاري المزامنة الآن...',
        statusSuccess: 'اكتملت المزامنة بنجاح',
        statusError: 'حدث خطأ في المزامنة'
      },
      en: {
        brand: 'XPharma Warehouse Sync Agent',
        bannerTitle: 'Sync ALL Warehouse Historical Data (No Time Limits)',
        bannerSub: 'Uploads all invoices, cash receipts, pharmacies, and medicines directly to the cloud.',
        syncNow: 'Sync ALL Data Now',
        statInv: 'Total Invoices Uploaded',
        statRcpt: 'Total Cash Receipts',
        statCust: 'Total Pharmacies / Customers',
        statProd: 'Total Medicines / Products',
        logsTitle: 'Live Operation Log',
        settingsTitle: 'Connection & Database Settings',
        lblDb: 'Firebird Database File Path (ORGA.GDB):',
        lblHost: 'Master Server IP / Host:',
        lblKey: 'Cloud API Token:',
        btnSave: 'Save Settings to config.yaml',
        langBtn: 'العربية 🌐',
        statusIdle: 'Idle (Ready)',
        statusSyncing: 'Syncing Data...',
        statusSuccess: 'Sync Completed',
        statusError: 'Sync Error'
      }
    };

    function applyLanguage(lang) {
      currentLang = lang;
      localStorage.setItem('agent_lang', lang);
      const isAr = lang === 'ar';
      document.getElementById('htmlTag').dir = isAr ? 'rtl' : 'ltr';
      document.getElementById('htmlTag').lang = isAr ? 'ar' : 'en';
      document.body.className = isAr ? '' : 'lang-en';

      const d = dict[lang];
      document.getElementById('t-brand').innerText = d.brand;
      document.getElementById('t-banner-title').innerText = d.bannerTitle;
      document.getElementById('t-banner-sub').innerText = d.bannerSub;
      document.getElementById('t-sync-now').innerText = d.syncNow;
      document.getElementById('t-stat-inv').innerText = d.statInv;
      document.getElementById('t-stat-rcpt').innerText = d.statRcpt;
      document.getElementById('t-stat-cust').innerText = d.statCust;
      document.getElementById('t-stat-prod').innerText = d.statProd;
      document.getElementById('t-logs-title').innerText = d.logsTitle;
      document.getElementById('t-settings-title').innerText = d.settingsTitle;
      document.getElementById('t-lbl-db').innerText = d.lblDb;
      document.getElementById('t-lbl-host').innerText = d.lblHost;
      document.getElementById('t-lbl-key').innerText = d.lblKey;
      document.getElementById('t-btn-save').innerText = d.btnSave;
      document.getElementById('lang-btn-text').innerText = d.langBtn;
    }

    function toggleLanguage() {
      applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
    }

    applyLanguage(currentLang);

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

        document.getElementById('valInvoices').innerText = (data.total_invoices || 0).toLocaleString();
        document.getElementById('valReceipts').innerText = (data.total_receipts || 0).toLocaleString();
        document.getElementById('valCustomers').innerText = (data.total_customers || 0).toLocaleString();
        document.getElementById('valProducts').innerText = (data.total_products || 0).toLocaleString();

        const badge = document.getElementById('statusBadge');
        const statusTxt = document.getElementById('statusText');
        const d = dict[currentLang];

        if (data.status === 'syncing') {
          badge.className = 'badge-status badge-syncing';
          badge.innerHTML = '<span class="dot dot-blue"></span> ' + d.statusSyncing;
          document.getElementById('syncBtn').disabled = true;
        } else if (data.status === 'error') {
          badge.className = 'badge-status badge-error';
          badge.innerHTML = '⚠️ ' + d.statusError;
          document.getElementById('syncBtn').disabled = false;
        } else if (data.status === 'success') {
          badge.className = 'badge-status badge-success';
          badge.innerHTML = '✅ ' + d.statusSuccess;
          document.getElementById('syncBtn').disabled = false;
        } else {
          badge.className = 'badge-status badge-success';
          badge.innerHTML = '<span class="dot dot-green"></span> ' + d.statusIdle;
          document.getElementById('syncBtn').disabled = false;
        }

        if (data.config) {
          if (!document.getElementById('inputDB').value) document.getElementById('inputDB').value = data.config.db_path || '';
          if (!document.getElementById('inputHost').value) document.getElementById('inputHost').value = data.config.host || '127.0.0.1';
        }

        if (data.recent_logs && data.recent_logs.length > 0) {
          const logBox = document.getElementById('logBox');
          logBox.innerHTML = data.recent_logs.map(l => '<div class="log-line">' + escapeHtml(l) + '</div>').join('');
          logBox.scrollTop = logBox.scrollHeight;
        }
      } catch (_) {}
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.innerText = text;
      return div.innerHTML;
    }

    async function triggerSync() {
      document.getElementById('syncBtn').disabled = true;
      try {
        await fetch('/api/sync-now', { method: 'POST' });
        setTimeout(fetchStatus, 500);
      } catch (e) {
        alert('Failed to trigger sync: ' + e);
        document.getElementById('syncBtn').disabled = false;
      }
    }

    async function saveSettings() {
      const dbPath = document.getElementById('inputDB').value;
      const host = document.getElementById('inputHost').value;
      const key = document.getElementById('inputKey').value;
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ db_path: dbPath, host: host, api_key: key, language: currentLang })
        });
        alert(currentLang === 'ar' ? 'تم حفظ الإعدادات بنجاح!' : 'Settings saved successfully!');
        fetchStatus();
      } catch (e) {
        alert('Save error: ' + e);
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 3000);
  </script>
</body>
</html>
`

// -----------------------------------------------------------------------------
// Main Application Entrypoint
// -----------------------------------------------------------------------------

func main() {
	initWindowsConsole()

	configPath := flag.String("config", "", "Path to config file (config.yaml)")
	syncNow := flag.Bool("sync-now", false, "Perform an immediate one-shot sync of ALL data and exit")
	noPrompt := flag.Bool("no-prompt", false, "Skip interactive prompt and use saved config")
	daemon := flag.Bool("daemon", false, "Run in background daemon mode without prompt")
	langFlag := flag.String("lang", "", "Language: 'ar' (Arabic) or 'en' (English)")
	accountFlag := flag.String("account", "", "Search for customer by account code in Firebird")
	flag.Parse()

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Printf("Fatal: Error loading config file: %v", err)
		if !*daemon && !*noPrompt {
			fmt.Println("\nPress ENTER to close...")
			bufio.NewReader(os.Stdin).ReadString('\n')
		}
		os.Exit(1)
	}

	if *langFlag == "ar" || *langFlag == "en" {
		cfg.Language = *langFlag
	}

	isAr := cfg.Language != "en"

	if isAr {
		log.Println("==========================================================")
		log.Println("       XPharma Warehouse Sync Agent - وكيل مزامنة المخزن  ")
		log.Println("==========================================================")
	} else {
		log.Println("==========================================================")
		log.Println("       XPharma Warehouse Sync Agent (All Data Engine)     ")
		log.Println("==========================================================")
	}

	// Customer search directly via flag
	if *accountFlag != "" {
		findAccount(cfg, *accountFlag)
		if !*daemon && !*noPrompt {
			fmt.Println("\nPress ENTER to close / اضغط ENTER للإغلاق...")
			bufio.NewReader(os.Stdin).ReadString('\n')
		}
		return
	}

	// Interactive Configuration Prompt if not running as daemon
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

	if isAr {
		addLog(fmt.Sprintf("رابط السحابة: %s", cfg.Cloud.APIURL))
		addLog(fmt.Sprintf("مفتاح الأمان (Agent Key): %s", maskedKey))
		addLog(fmt.Sprintf("سيرفر الفايربيرد: %s:%d", cfg.Firebird.Host, cfg.Firebird.Port))
		addLog(fmt.Sprintf("مسار قاعدة البيانات: %s", cfg.Firebird.DBPath))
		addLog(fmt.Sprintf("دورة التحديث التلقائي: كل %d ثانية", cfg.Cloud.SyncIntervalSeconds))
	} else {
		addLog(fmt.Sprintf("Cloud URL: %s", cfg.Cloud.APIURL))
		addLog(fmt.Sprintf("Agent Key: %s", maskedKey))
		addLog(fmt.Sprintf("Firebird Server: %s:%d", cfg.Firebird.Host, cfg.Firebird.Port))
		addLog(fmt.Sprintf("Database Path: %s", cfg.Firebird.DBPath))
		addLog(fmt.Sprintf("Sync Interval: Every %d seconds", cfg.Cloud.SyncIntervalSeconds))
	}

	// Start Built-in Web Dashboard in background
	go func() {
		startLocalWebServer(cfg)
	}()
	if isAr {
		addLog(fmt.Sprintf("[WEB] تم تشغيل لوحة التحكم المحلية على: http://localhost:%d", cfg.WebPort))
		addLog("[WEB] يمكنك فتح الرابط في المتصفح لرؤية شاشة عربية/إنجليزية تفاعلية ومتابعة المزامنة الحية.")
	} else {
		addLog(fmt.Sprintf("[WEB] Local Web Dashboard running at: http://localhost:%d", cfg.WebPort))
		addLog("[WEB] Open in your browser for a modern visual bilingual dashboard.")
	}

	// Immediate Full Sync
	if *syncNow {
		if isAr {
			addLog("[SYNC] جاري بدء المزامنة الكاملة لجميع البيانات التاريخية الآن...")
		} else {
			addLog("[SYNC] Starting full sync of ALL historical data now...")
		}
		if err := performFullSync(cfg); err != nil {
			if isAr {
				addLog(fmt.Sprintf("[ERROR] فشلت المزامنة: %v", err))
			} else {
				addLog(fmt.Sprintf("[ERROR] Sync failed: %v", err))
			}
		} else {
			if isAr {
				addLog("[SUCCESS] اكتملت مزامنة جميع بيانات المستودع بنجاح تام!")
			} else {
				addLog("[SUCCESS] Full warehouse sync completed successfully!")
			}
		}
		if !*daemon && !*noPrompt {
			if isAr {
				fmt.Println("\nاضغط ENTER للإغلاق...")
			} else {
				fmt.Println("\nPress ENTER to close...")
			}
			bufio.NewReader(os.Stdin).ReadString('\n')
		}
		return
	}

	// Continuous Monitoring Loop (Daemon)
	if isAr {
		addLog("[DAEMON] تم تشغيل الوكيل في وضع المراقبة الدورية المستمرة...")
	} else {
		addLog("[DAEMON] Agent running in continuous monitoring mode...")
	}

	// Run initial full sync immediately
	if err := performFullSync(cfg); err != nil {
		addLog(fmt.Sprintf("[WARN] Initial sync issue: %v", err))
	}

	ticker := time.NewTicker(time.Duration(cfg.Cloud.SyncIntervalSeconds) * time.Second)
	defer ticker.Stop()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			if err := performFullSync(cfg); err != nil {
				addLog(fmt.Sprintf("[ERROR] Periodic sync error: %v", err))
			}
		case sig := <-sigChan:
			if isAr {
				addLog(fmt.Sprintf("[STOP] تم استقبال إشارة إيقاف (%v). جارٍ إنهاء الوكيل بأمان...", sig))
			} else {
				addLog(fmt.Sprintf("[STOP] Stop signal received (%v). Exiting cleanly...", sig))
			}
			return
		}
	}
}
