package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
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
)

// -----------------------------------------------------------------------------
// Configuration Model
// -----------------------------------------------------------------------------

type Config struct {
	Language            string `json:"language"`              // "ar" or "en"
	SyncMode            string `json:"sync_mode"`             // "gentle", "balanced", "fast"
	BatchSize           int    `json:"batch_size"`            // default 100
	BatchDelayMs        int    `json:"batch_delay_ms"`        // default 1500ms
	AutoStart           bool   `json:"auto_start"`            // Auto-start on Windows reboot
	AutoSync            bool   `json:"auto_sync"`             // Continuous background sync
	SyncIntervalSeconds int    `json:"sync_interval_seconds"` // default 60s
	WebPort             int    `json:"web_port"`

	Cloud struct {
		APIURL              string `json:"api_url"`
		APIKey              string `json:"api_key"`
		SyncIntervalSeconds int    `json:"sync_interval_seconds"`
	} `json:"cloud"`

	Firebird struct {
		DBPath   string `json:"db_path"`
		Host     string `json:"host"`
		Port     int    `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
	} `json:"firebird"`

	Cursors struct {
		LastInvoiceID int64 `json:"last_invoice_id"`
		LastReceiptID int64 `json:"last_receipt_id"`
	} `json:"cursors"`
}

// -----------------------------------------------------------------------------
// Payloads
// -----------------------------------------------------------------------------

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
	RemoteID        string    `json:"remote_id"`
	InvoiceNumber   string    `json:"invoice_number"`
	PharmacyCode    string    `json:"pharmacy_code"`
	InvoiceDate     time.Time `json:"invoice_date"`
	TotalAmount     float64   `json:"total_amount"`
	DiscountAmount  float64   `json:"discount_amount"`
	NetAmount       float64   `json:"net_amount"`
	PaidAmount      float64   `json:"paid_amount"`
	RemainingAmount float64   `json:"remaining_amount"`
	Status          string    `json:"status"`
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

// -----------------------------------------------------------------------------
// Live Engine State
// -----------------------------------------------------------------------------

type EngineState struct {
	sync.Mutex
	Status            string    `json:"status"` // "idle", "syncing", "paused", "success", "error"
	FirebirdConnected bool      `json:"firebird_connected"`
	CloudConnected    bool      `json:"cloud_connected"`
	AutoStartEnabled  bool      `json:"auto_start_enabled"`
	CurrentTask       string    `json:"current_task"`
	ProgressPercent   int       `json:"progress_percent"`
	TotalInvoices     int       `json:"total_invoices"`
	SyncedInvoices    int       `json:"synced_invoices"`
	TotalReceipts     int       `json:"total_receipts"`
	SyncedReceipts    int       `json:"synced_receipts"`
	TotalCustomers    int       `json:"total_customers"`
	TotalProducts     int       `json:"total_products"`
	LastSyncTime      time.Time `json:"last_sync_time"`
	LastError         string    `json:"last_error"`
	Logs              []string  `json:"logs"`
	ShouldPause       bool      `json:"-"`
	IsRunning         bool      `json:"-"`
	DaemonRunning     bool      `json:"-"`
}

var state = &EngineState{
	Status:      "idle",
	CurrentTask: "جاهز للبدء",
	Logs:        []string{},
}

func addLog(msg string) {
	log.Println(msg)
	state.Lock()
	defer state.Unlock()
	entry := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), msg)
	state.Logs = append(state.Logs, entry)
	if len(state.Logs) > 80 {
		state.Logs = state.Logs[len(state.Logs)-80:]
	}
}

// -----------------------------------------------------------------------------
// Windows Auto-Start (Registry & Task Scheduler)
// -----------------------------------------------------------------------------

func setWindowsAutoStart(enable bool) error {
	if runtime.GOOS != "windows" {
		return nil
	}
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	exePath, _ = filepath.EvalSymlinks(exePath)

	if enable {
		// 1. Add to HKCU Run Key (Runs automatically when user logs into Windows without requiring Admin rights)
		cmdReg := exec.Command("reg", "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
			"/v", "XPharmaSyncAgent",
			"/t", "REG_SZ",
			"/d", fmt.Sprintf("\"%s\" -daemon", exePath),
			"/f")
		_ = cmdReg.Run()

		// 2. Also register in Task Scheduler on logon for redundancy
		cmdTask := exec.Command("schtasks", "/create",
			"/tn", "XPharmaSyncAgent",
			"/tr", fmt.Sprintf("\"%s\" -daemon", exePath),
			"/sc", "onlogon",
			"/f")
		_ = cmdTask.Run()

		addLog("تم تفعيل التشغيل التلقائي مع فتح الويندوز بنجاح (Auto-Start Enabled).")
		return nil
	} else {
		cmdReg := exec.Command("reg", "delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
			"/v", "XPharmaSyncAgent",
			"/f")
		_ = cmdReg.Run()

		cmdTask := exec.Command("schtasks", "/delete", "/tn", "XPharmaSyncAgent", "/f")
		_ = cmdTask.Run()

		addLog("تم إيقاف التشغيل التلقائي مع فتح الويندوز.")
		return nil
	}
}

func isWindowsAutoStartEnabled() bool {
	if runtime.GOOS != "windows" {
		return false
	}
	cmd := exec.Command("reg", "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "XPharmaSyncAgent")
	return cmd.Run() == nil
}

// -----------------------------------------------------------------------------
// Windows Console UTF-8 & App Launcher
// -----------------------------------------------------------------------------

func initWindowsConsole() {
	if runtime.GOOS == "windows" {
		kernel32 := syscall.NewLazyDLL("kernel32.dll")
		setConsoleOutputCP := kernel32.NewProc("SetConsoleOutputCP")
		setConsoleCP := kernel32.NewProc("SetConsoleCP")
		if setConsoleOutputCP.Find() == nil {
			setConsoleOutputCP.Call(65001)
		}
		if setConsoleCP.Find() == nil {
			setConsoleCP.Call(65001)
		}

		getStdHandle := kernel32.NewProc("GetStdHandle")
		getConsoleMode := kernel32.NewProc("GetConsoleMode")
		setConsoleMode := kernel32.NewProc("SetConsoleMode")
		if getStdHandle.Find() == nil && getConsoleMode.Find() == nil && setConsoleMode.Find() == nil {
			const stdOutputHandle = uint32(0xFFFFFFF5)
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

func openAppWindow(url string) {
	// 1. Try Microsoft Edge in standalone App Mode (No address bar, looks like native desktop window)
	edgePaths := []string{
		`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
		`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
	}
	for _, p := range edgePaths {
		if _, err := os.Stat(p); err == nil {
			cmd := exec.Command(p, fmt.Sprintf("--app=%s", url), "--window-size=980,750")
			if err := cmd.Start(); err == nil {
				return
			}
		}
	}

	// 2. Try Google Chrome in App Mode
	chromePaths := []string{
		`C:\Program Files\Google\Chrome\Application\chrome.exe`,
		`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Google\Chrome\Application\chrome.exe`),
	}
	for _, p := range chromePaths {
		if _, err := os.Stat(p); err == nil {
			cmd := exec.Command(p, fmt.Sprintf("--app=%s", url), "--window-size=980,750")
			if err := cmd.Start(); err == nil {
				return
			}
		}
	}

	// 3. Fallback to default browser
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

// -----------------------------------------------------------------------------
// Text Sanitization & Decoding
// -----------------------------------------------------------------------------

func decodeText(input []byte) string {
	if len(input) == 0 {
		return ""
	}
	if utf8.Valid(input) {
		return cleanControlChars(strings.TrimSpace(string(input)))
	}
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
// Config Management (Unified config.json)
// -----------------------------------------------------------------------------

const configFileName = "config.json"

func loadConfig() *Config {
	cfg := &Config{
		Language:            "ar",
		SyncMode:            "gentle",
		BatchSize:           100,
		BatchDelayMs:        1500, // 1.5 second pause between batches to protect DB and server
		AutoStart:           true, // Auto-start on boot
		AutoSync:            true, // Continuous sync every 60s
		SyncIntervalSeconds: 60,
		WebPort:             8080,
	}
	cfg.Cloud.APIURL = "https://api.xpharma.cloud"
	cfg.Cloud.SyncIntervalSeconds = 60
	cfg.Firebird.Host = "127.0.0.1"
	cfg.Firebird.Port = 3050
	cfg.Firebird.User = "SYSDBA"
	cfg.Firebird.Password = "masterkey"

	data, err := os.ReadFile(configFileName)
	if err == nil {
		_ = json.Unmarshal(data, cfg)
	}

	// Sanitization
	cfg.Cloud.APIKey = cleanInput(cfg.Cloud.APIKey)
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
	if cfg.SyncMode == "" {
		cfg.SyncMode = "gentle"
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 100
	}
	if cfg.BatchDelayMs <= 0 {
		cfg.BatchDelayMs = 1500
	}
	if cfg.SyncIntervalSeconds <= 0 {
		cfg.SyncIntervalSeconds = 60
	}
	return cfg
}

func saveConfig(cfg *Config) {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err == nil {
		_ = os.WriteFile(configFileName, data, 0644)
	}
}

// -----------------------------------------------------------------------------
// Database Connection
// -----------------------------------------------------------------------------

func connectFirebird(cfg *Config) (*sql.DB, error) {
	fb := cfg.Firebird
	cleanPath := filepath.ToSlash(fb.DBPath)
	if !strings.HasPrefix(cleanPath, "/") && len(cleanPath) > 1 && cleanPath[1] == ':' {
		cleanPath = "/" + cleanPath
	}

	// Try Legacy_Auth with wire_crypt=false (Required for Firebird 2.5 / ORGA SOFT ERP)
	dsn := fmt.Sprintf("%s:%s@%s:%d%s?charset=NONE&auth_plugin_name=Legacy_Auth&wire_crypt=false",
		fb.User, fb.Password, fb.Host, fb.Port, cleanPath)

	db, err := sql.Open("firebirdsql", dsn)
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err == nil {
			return db, nil
		}
		db.Close()
	}

	// Try standard Firebird 3+ negotiation
	dsnDefault := fmt.Sprintf("%s:%s@%s:%d%s?charset=NONE&wire_crypt=false",
		fb.User, fb.Password, fb.Host, fb.Port, cleanPath)
	dbDefault, err := sql.Open("firebirdsql", dsnDefault)
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		if err := dbDefault.PingContext(ctx); err == nil {
			return dbDefault, nil
		}
		dbDefault.Close()
	}
	return nil, err
}

func checkConnections(cfg *Config) (fbOk bool, cloudOk bool) {
	// 1. Check Firebird
	if cfg.Firebird.DBPath != "" {
		db, err := connectFirebird(cfg)
		if err == nil {
			fbOk = true
			db.Close()
		}
	}

	// 2. Check Cloud
	cleanURL := strings.TrimRight(cfg.Cloud.APIURL, "/")
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get(cleanURL + "/health")
	if err == nil && (resp.StatusCode == http.StatusOK || resp.StatusCode == 404 || resp.StatusCode == 401) {
		cloudOk = true
		resp.Body.Close()
	}
	return
}

func parseDate(raw interface{}) time.Time {
	if raw == nil {
		return time.Now()
	}
	switch v := raw.(type) {
	case time.Time:
		return v
	case string:
		v = strings.TrimSpace(v)
		for _, layout := range []string{
			"2006-01-02 15:04:05", "2006-01-02", "2006/01/02", "02/01/2006", "02-01-2006", time.RFC3339,
		} {
			if t, err := time.Parse(layout, v); err == nil {
				return t
			}
		}
	case []byte:
		return parseDate(string(v))
	}
	return time.Now()
}

// -----------------------------------------------------------------------------
// Gentle, Throttled Sync Engine (خفيف وهادئ جداً لمنع التهنيج)
// -----------------------------------------------------------------------------

func postBatch(apiURL, apiKey string, payload IngestionPayload) error {
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	var gzBuffer bytes.Buffer
	gzWriter := gzip.NewWriter(&gzBuffer)
	if _, err := gzWriter.Write(jsonBytes); err != nil {
		return err
	}
	_ = gzWriter.Close()

	cleanURL := strings.TrimRight(apiURL, "/")
	if !strings.HasSuffix(cleanURL, "/v1/sync/ingest") {
		cleanURL += "/v1/sync/ingest"
	}

	req, err := http.NewRequest("POST", cleanURL, &gzBuffer)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("X-Agent-Key", apiKey)

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func runGentleSync(cfg *Config) {
	state.Lock()
	if state.IsRunning {
		state.Unlock()
		return
	}
	state.IsRunning = true
	state.ShouldPause = false
	state.Status = "syncing"
	state.LastError = ""
	state.Unlock()

	defer func() {
		state.Lock()
		state.IsRunning = false
		if state.Status == "syncing" {
			state.Status = "idle"
		}
		state.Unlock()
	}()

	isAr := cfg.Language != "en"

	db, err := connectFirebird(cfg)
	if err != nil {
		state.Lock()
		state.Status = "error"
		state.LastError = fmt.Sprintf("فشل الاتصال بقاعدة بيانات الفايربيرد: %v", err)
		state.FirebirdConnected = false
		state.Unlock()
		addLog(fmt.Sprintf("خطأ في الاتصال بالفايربيرد: %v", err))
		return
	}
	defer db.Close()

	state.Lock()
	state.FirebirdConnected = true
	state.Unlock()

	// 1. Quick indexed counts
	var totalInvoices, totalReceipts int
	_ = db.QueryRow("SELECT COUNT(*) FROM INVOICES_H").Scan(&totalInvoices)
	_ = db.QueryRow("SELECT COUNT(*) FROM INCOME_CASH").Scan(&totalReceipts)

	state.Lock()
	state.TotalInvoices = totalInvoices
	state.TotalReceipts = totalReceipts
	state.Unlock()

	batchSize := cfg.BatchSize
	if batchSize <= 0 {
		batchSize = 100
	}
	delayMs := cfg.BatchDelayMs
	if delayMs <= 0 {
		delayMs = 1500
	}

	// 2. Sync Customers once if not yet loaded
	state.Lock()
	currCusts := state.TotalCustomers
	state.Unlock()

	if currCusts == 0 {
		custRows, err := db.Query("SELECT * FROM ACCOUNTS")
		if err == nil {
			cols, _ := custRows.Columns()
			idIdx, nameIdx, phoneIdx, addrIdx := -1, -1, -1, -1
			for idx, c := range cols {
				u := strings.ToUpper(strings.TrimSpace(c))
				if idIdx == -1 && (u == "ACCOUNT_ID" || u == "ACC_ID" || u == "ID" || u == "CODE") {
					idIdx = idx
				}
				if nameIdx == -1 && (u == "ACCOUNT_NAME" || u == "ACC_NAME" || u == "NAME") {
					nameIdx = idx
				}
				if phoneIdx == -1 && (u == "PHONE" || u == "TEL" || u == "MOBILE") {
					phoneIdx = idx
				}
				if addrIdx == -1 && (u == "ADDRESS" || u == "ADDR") {
					addrIdx = idx
				}
			}

			var custList []CustomerSyncItem
			if idIdx != -1 && nameIdx != -1 {
				for custRows.Next() {
					vals := make([]interface{}, len(cols))
					valPtrs := make([]interface{}, len(cols))
					for i := range vals {
						valPtrs[i] = &vals[i]
					}
					if err := custRows.Scan(valPtrs...); err != nil {
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
						custList = append(custList, CustomerSyncItem{
							Code:    cCode,
							Name:    cName,
							Phone:   cPhone,
							Address: cAddr,
						})
					}
				}
			}
			custRows.Close()

			state.Lock()
			state.TotalCustomers = len(custList)
			state.Unlock()

			// Upload in small chunks of 300
			for i := 0; i < len(custList); i += 300 {
				end := i + 300
				if end > len(custList) {
					end = len(custList)
				}
				p := IngestionPayload{Customers: custList[i:end]}
				_ = postBatch(cfg.Cloud.APIURL, cfg.Cloud.APIKey, p)
				time.Sleep(400 * time.Millisecond)
			}
		}
	}

	// 3. Gentle Indexed Invoices Extraction (Takes < 2ms, frees DB locks immediately)
	lastInvID := cfg.Cursors.LastInvoiceID
	syncedInvoices := 0

	for {
		state.Lock()
		if state.ShouldPause {
			state.Status = "paused"
			state.CurrentTask = "المزامنة متوقفة مؤقتاً"
			state.Unlock()
			return
		}
		state.CurrentTask = fmt.Sprintf("رفع الفواتير بهدوء... تم رفع %d فاتورة", syncedInvoices)
		state.Unlock()

		q := fmt.Sprintf(`
			SELECT FIRST %d 
				INVOICES_H_ID, DATE_D, TOTAL_TOTAL, TOTAL_DISCOUNT1, TOTAL_MONY_PAY, ACCOUNT_ID
			FROM INVOICES_H
			WHERE INVOICES_H_ID > %d
			ORDER BY INVOICES_H_ID ASC
		`, batchSize, lastInvID)

		rows, err := db.Query(q)
		if err != nil {
			break
		}

		var batch []InvoiceSyncItem
		var maxIDInBatch int64 = lastInvID

		for rows.Next() {
			var id int64
			var rawDate interface{}
			var total, discount, paid float64
			var accountID int64
			if err := rows.Scan(&id, &rawDate, &total, &discount, &paid, &accountID); err != nil {
				continue
			}
			if id > maxIDInBatch {
				maxIDInBatch = id
			}
			dateD := parseDate(rawDate)
			net := total - discount
			rem := net - paid
			batch = append(batch, InvoiceSyncItem{
				RemoteID:        fmt.Sprintf("%d", id),
				InvoiceNumber:   fmt.Sprintf("INV-%d", id),
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
		rows.Close() // Release locks immediately

		if len(batch) == 0 {
			break
		}

		payload := IngestionPayload{Invoices: batch}
		if err := postBatch(cfg.Cloud.APIURL, cfg.Cloud.APIKey, payload); err != nil {
			addLog(fmt.Sprintf("تنبيه أثناء إرسال الدفعة: %v", err))
			time.Sleep(2 * time.Second)
			continue
		}

		syncedInvoices += len(batch)
		lastInvID = maxIDInBatch
		cfg.Cursors.LastInvoiceID = lastInvID
		saveConfig(cfg)

		state.Lock()
		state.SyncedInvoices = syncedInvoices
		if totalInvoices > 0 {
			state.ProgressPercent = (syncedInvoices * 80) / totalInvoices
		}
		state.Unlock()

		// Gentle Pause to let warehouse server and ERP breathe freely
		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}

	// 4. Gentle Indexed Cash Receipts Extraction
	lastRcptID := cfg.Cursors.LastReceiptID
	syncedRcpts := 0

	for {
		state.Lock()
		if state.ShouldPause {
			state.Status = "paused"
			state.Unlock()
			return
		}
		state.CurrentTask = fmt.Sprintf("رفع سندات القبض بهدوء... تم رفع %d سند", syncedRcpts)
		state.Unlock()

		q := fmt.Sprintf(`
			SELECT FIRST %d 
				INCOME_CASH_ID, DATE_D, CASH, ACCOUNT_ID, USERS_NAME
			FROM INCOME_CASH
			WHERE INCOME_CASH_ID > %d
			ORDER BY INCOME_CASH_ID ASC
		`, batchSize, lastRcptID)

		rows, err := db.Query(q)
		if err != nil {
			break
		}

		var batch []CashReceiptSyncItem
		var maxIDInBatch int64 = lastRcptID

		for rows.Next() {
			var id int64
			var rawDate interface{}
			var amount float64
			var accountID int64
			var userRaw []byte
			if err := rows.Scan(&id, &rawDate, &amount, &accountID, &userRaw); err != nil {
				continue
			}
			if id > maxIDInBatch {
				maxIDInBatch = id
			}
			dateD := parseDate(rawDate)
			collector := decodeText(userRaw)
			batch = append(batch, CashReceiptSyncItem{
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
		rows.Close()

		if len(batch) == 0 {
			break
		}

		payload := IngestionPayload{CashReceipts: batch}
		if err := postBatch(cfg.Cloud.APIURL, cfg.Cloud.APIKey, payload); err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		syncedRcpts += len(batch)
		lastRcptID = maxIDInBatch
		cfg.Cursors.LastReceiptID = lastRcptID
		saveConfig(cfg)

		state.Lock()
		state.SyncedReceipts = syncedRcpts
		state.Unlock()

		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}

	state.Lock()
	state.Status = "success"
	state.CurrentTask = "المزامنة مكتملة وفي وضع المراقبة والتحديث التلقائي المستمر"
	state.ProgressPercent = 100
	state.LastSyncTime = time.Now()
	state.CloudConnected = true
	state.Unlock()

	if isAr {
		addLog(fmt.Sprintf("اكتملت المزامنة بنجاح! آخر فحص: %s", time.Now().Format("15:04:05")))
	} else {
		addLog(fmt.Sprintf("Sync cycle completed successfully! Last checked: %s", time.Now().Format("15:04:05")))
	}
}

// -----------------------------------------------------------------------------
// Continuous Background Sync Loop (المراقبة والتحديث التلقائي المستمر)
// -----------------------------------------------------------------------------

func startContinuousDaemon(cfg *Config) {
	state.Lock()
	if state.DaemonRunning {
		state.Unlock()
		return
	}
	state.DaemonRunning = true
	state.Unlock()

	addLog("تم تفعيل وضع التحديث التلقائي المستمر (يعمل في الخلفية باستمرار).")

	// Run initial sync cycle
	if cfg.Firebird.DBPath != "" && cfg.Cloud.APIKey != "" {
		runGentleSync(cfg)
	}

	interval := cfg.SyncIntervalSeconds
	if interval <= 0 {
		interval = 60
	}
	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		state.Lock()
		autoSync := cfg.AutoSync
		state.Unlock()

		if !autoSync {
			continue
		}

		if cfg.Firebird.DBPath != "" && cfg.Cloud.APIKey != "" {
			runGentleSync(cfg)
		}
	}
}

// -----------------------------------------------------------------------------
// Embedded App Window & HTTP Server
// -----------------------------------------------------------------------------

func startInternalServer(cfg *Config) {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		state.Lock()
		defer state.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":              state.Status,
			"current_task":        state.CurrentTask,
			"progress_percent":    state.ProgressPercent,
			"firebird_connected":  state.FirebirdConnected,
			"cloud_connected":     state.CloudConnected,
			"auto_start_enabled":  state.AutoStartEnabled,
			"total_invoices":      state.TotalInvoices,
			"synced_invoices":     state.SyncedInvoices,
			"total_receipts":      state.TotalReceipts,
			"synced_receipts":     state.SyncedReceipts,
			"total_customers":     state.TotalCustomers,
			"total_products":      state.TotalProducts,
			"last_sync_time":      state.LastSyncTime.Format("15:04:05 2006-01-02"),
			"last_error":          state.LastError,
			"logs":                state.Logs,
			"config":              cfg,
		})
	})

	mux.HandleFunc("/api/save", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			DBPath    string `json:"db_path"`
			Host      string `json:"host"`
			APIKey    string `json:"api_key"`
			SyncMode  string `json:"sync_mode"`
			AutoStart bool   `json:"auto_start"`
			AutoSync  bool   `json:"auto_sync"`
			Language  string `json:"language"`
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
			if req.SyncMode != "" {
				cfg.SyncMode = req.SyncMode
				if req.SyncMode == "gentle" {
					cfg.BatchSize = 100
					cfg.BatchDelayMs = 1500
				} else if req.SyncMode == "balanced" {
					cfg.BatchSize = 150
					cfg.BatchDelayMs = 800
				} else if req.SyncMode == "fast" {
					cfg.BatchSize = 300
					cfg.BatchDelayMs = 300
				}
			}
			cfg.AutoStart = req.AutoStart
			cfg.AutoSync = req.AutoSync
			if req.Language == "ar" || req.Language == "en" {
				cfg.Language = req.Language
			}

			// Apply Auto-Start to Windows Registry
			_ = setWindowsAutoStart(cfg.AutoStart)
			state.Lock()
			state.AutoStartEnabled = isWindowsAutoStartEnabled()
			state.Unlock()

			saveConfig(cfg)
			fbOk, cloudOk := checkConnections(cfg)
			state.Lock()
			state.FirebirdConnected = fbOk
			state.CloudConnected = cloudOk
			state.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
	})

	mux.HandleFunc("/api/start", func(w http.ResponseWriter, r *http.Request) {
		cfg.AutoSync = true
		saveConfig(cfg)
		go startContinuousDaemon(cfg)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "started"})
	})

	mux.HandleFunc("/api/pause", func(w http.ResponseWriter, r *http.Request) {
		cfg.AutoSync = false
		saveConfig(cfg)
		state.Lock()
		state.ShouldPause = true
		state.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "paused"})
	})

	mux.HandleFunc("/api/reset", func(w http.ResponseWriter, r *http.Request) {
		cfg.Cursors.LastInvoiceID = 0
		cfg.Cursors.LastReceiptID = 0
		saveConfig(cfg)
		state.Lock()
		state.SyncedInvoices = 0
		state.SyncedReceipts = 0
		state.ProgressPercent = 0
		state.Unlock()
		addLog("تمت إعادة تعيين مؤشرات المزامنة للبدء من البداية.")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "reset"})
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, appHTML)
	})

	addr := fmt.Sprintf("127.0.0.1:%d", cfg.WebPort)
	server := &http.Server{Addr: addr, Handler: mux}
	_ = server.ListenAndServe()
}

// -----------------------------------------------------------------------------
// App Window Interface (HTML/CSS/JS)
// -----------------------------------------------------------------------------

const appHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl" id="htmlTag">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>وكيل مزامنة مستودع الأدوية | XPharma Sync Agent</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b1120;
      --card-bg: #131d33;
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --font-ar: 'Cairo', sans-serif;
      --font-en: 'Inter', sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-ar);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
    }
    body.lang-en { font-family: var(--font-en); }
    
    .topbar {
      background: rgba(15, 23, 42, 0.95);
      border-bottom: 1px solid var(--card-border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: white;
      font-size: 18px;
    }
    .brand-text h1 { font-size: 16px; font-weight: 700; color: white; }
    .brand-text p { font-size: 11px; color: var(--text-muted); }
    
    .lang-toggle {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .lang-toggle:hover { background: rgba(255, 255, 255, 0.12); }

    .main {
      padding: 20px 24px;
      max-width: 980px;
      margin: 0 auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
    }

    /* Connection Status Badges */
    .status-bar {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .status-pill {
      flex: 1;
      min-width: 240px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .status-label { font-size: 12px; color: var(--text-muted); }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot-green { background: #10b981; box-shadow: 0 0 8px #10b981; }
    .dot-red { background: #ef4444; }
    .dot-blue { background: #3b82f6; animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    /* Settings Box */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 700;
      color: white;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 14px;
    }
    @media (max-width: 700px) { .form-grid { grid-template-columns: 1fr; } }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group.full { grid-column: 1 / -1; }
    .form-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .form-input {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      color: white;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      font-family: inherit;
      transition: border 0.2s;
    }
    .form-input:focus { border-color: var(--primary); }

    /* Pace Selector */
    .pace-box {
      margin-top: 14px;
      background: rgba(37, 99, 235, 0.08);
      border: 1px solid rgba(37, 99, 235, 0.2);
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pace-text { font-size: 12px; }
    .pace-text strong { color: #60a5fa; }
    .pace-select {
      background: #1e293b;
      color: white;
      border: 1px solid var(--card-border);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }

    /* Auto-Start Box */
    .autostart-box {
      margin-top: 12px;
      background: rgba(16, 185, 129, 0.06);
      border: 1px solid rgba(16, 185, 129, 0.22);
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }

    /* Actions */
    .actions-bar {
      display: flex;
      gap: 10px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #2563eb;
      color: white;
      box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.25); }

    /* Progress & Counters */
    .progress-wrap {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      height: 10px;
      overflow: hidden;
      margin: 10px 0;
      border: 1px solid var(--card-border);
    }
    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #2563eb, #38bdf8);
      width: 0%;
      transition: width 0.3s;
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 10px;
    }
    @media (max-width: 650px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
    .stat-mini {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .stat-mini-title { font-size: 11px; color: var(--text-muted); }
    .stat-mini-val { font-size: 18px; font-weight: 800; color: white; margin-top: 2px; }

    /* Live Log */
    .log-terminal {
      background: #06090e;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      color: #94a3b8;
      height: 160px;
      overflow-y: auto;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="brand-icon">XP</div>
      <div class="brand-text">
        <h1 id="t-brand">وكيل ربط ومزامنة مستودع الأدوية</h1>
        <p id="t-brand-sub">XPharma Warehouse Sync Agent</p>
      </div>
    </div>
    <button class="lang-toggle" onclick="toggleLanguage()" id="langBtn">English 🌐</button>
  </div>

  <div class="main">
    <!-- Status Pills -->
    <div class="status-bar">
      <div class="status-pill">
        <span class="status-label" id="t-st-fb">قاعدة بيانات الفايربيرد (ORGA.GDB):</span>
        <div class="status-indicator" id="indFb">
          <span class="dot dot-red" id="dotFb"></span>
          <span id="textFb">جاري الفحص...</span>
        </div>
      </div>
      <div class="status-pill">
        <span class="status-label" id="t-st-cloud">خادم المنصة السحابية:</span>
        <div class="status-indicator" id="indCloud">
          <span class="dot dot-red" id="dotCloud"></span>
          <span id="textCloud">جاري الفحص...</span>
        </div>
      </div>
    </div>

    <!-- Main Config Form -->
    <div class="card">
      <div class="card-title">
        <span>⚙️</span>
        <span id="t-sec-conn">بيانات الربط والاتصال الأساسية (مطلوب 3 بيانات فقط)</span>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" id="t-lbl-path">1. مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):</label>
          <input type="text" class="form-input" id="inPath" placeholder="D:\ORGA_SOFT\DATA\ORGA.GDB" />
        </div>
        <div class="form-group">
          <label class="form-label" id="t-lbl-ip">2. عنوان IP الماستر أو السيرفر (Master IP):</label>
          <input type="text" class="form-input" id="inHost" placeholder="127.0.0.1" />
        </div>
        <div class="form-group full">
          <label class="form-label" id="t-lbl-key">3. مفتاح الربط والتوكن السحابي (API Token):</label>
          <input type="password" class="form-input" id="inKey" placeholder="xph_agt_..." />
        </div>
      </div>

      <!-- Pacing Mode -->
      <div class="pace-box">
        <div class="pace-text">
          <span id="t-pace-title">🐢 سرعة الرفع: </span>
          <strong id="t-pace-desc">نمط هادئ وخفيف جداً (يحمي داتابيز المخزن وسيرفر السحابة من أي تهنيج)</strong>
        </div>
        <select class="pace-select" id="selMode">
          <option value="gentle">🐢 هادئ وخفيف جداً (موصى به - 100 سجل مع راحة)</option>
          <option value="balanced">⚖️ متوازن (150 سجل)</option>
          <option value="fast">⚡ سريع (300 سجل)</option>
        </select>
      </div>

      <!-- Auto-Start with Windows Box -->
      <div class="autostart-box">
        <div>
          <div style="font-weight: 700; font-size: 13px; color: #34d399; display: flex; align-items: center; gap: 6px;">
            <span>⚡</span>
            <span id="t-autostart-title">التشغيل التلقائي الذاتي (Auto-Start & Background Sync)</span>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;" id="t-autostart-desc">
            يبدأ البرنامج في العمل ذاتياً عند تشغيل الكمبيوتر أو إعادة تشغيله، ويقوم بتحديث البيانات دورياً كل 60 ثانية بدون تدخل يدوي.
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
            <input type="checkbox" id="chkAutoStart" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: #10b981;">
            <span id="t-chk-autostart">تشغيل تلقائي مع إقلاع الويندوز</span>
          </label>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="actions-bar">
        <button class="btn btn-primary" id="btnStart" onclick="startSync()">
          <span>▶️</span>
          <span id="t-btn-start">حفظ وبدء المزامنة التلقائية</span>
        </button>
        <button class="btn btn-secondary" id="btnPause" onclick="pauseSync()" style="display:none;">
          <span>⏸️</span>
          <span id="t-btn-pause">إيقاف مؤقت</span>
        </button>
        <button class="btn btn-secondary" onclick="saveSettingsOnly()">
          <span>💾</span>
          <span id="t-btn-save">حفظ الإعدادات فقط</span>
        </button>
        <button class="btn btn-danger" onclick="resetSync()" title="إعادة رفع الداتا من أول سجل">
          <span>🔄</span>
          <span id="t-btn-reset">إعادة من البداية</span>
        </button>
      </div>
    </div>

    <!-- Live Progress & Stats -->
    <div class="card">
      <div class="card-title" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📊</span>
          <span id="t-sec-prog">حالة المزامنة والتقدم المباشر</span>
        </div>
        <span style="font-size: 12px; color: #38bdf8;" id="currentTask">جاهز</span>
      </div>

      <div class="progress-wrap">
        <div class="progress-bar" id="progressBar"></div>
      </div>

      <div class="stats-row">
        <div class="stat-mini">
          <div class="stat-mini-title" id="t-st-invoices">الفواتير المرفوعة</div>
          <div class="stat-mini-val"><span id="cntInvoices">0</span> / <span id="totInvoices" style="color:var(--text-muted); font-size:13px;">0</span></div>
        </div>
        <div class="stat-mini">
          <div class="stat-mini-title" id="t-st-receipts">سندات القبض المرفوعة</div>
          <div class="stat-mini-val"><span id="cntReceipts">0</span> / <span id="totReceipts" style="color:var(--text-muted); font-size:13px;">0</span></div>
        </div>
        <div class="stat-mini">
          <div class="stat-mini-title" id="t-st-custs">دليل الصيدليات</div>
          <div class="stat-mini-val" id="cntCusts">0</div>
        </div>
        <div class="stat-mini">
          <div class="stat-mini-title" id="t-st-status">حالة الوكيل</div>
          <div class="stat-mini-val" id="stVal" style="font-size:15px; color:#34d399;">مفعل ويعمل في الخلفية</div>
        </div>
      </div>
    </div>

    <!-- Clean Log Box -->
    <div class="card">
      <div class="card-title">
        <span>📋</span>
        <span id="t-sec-log">سجل العمليات المباشر</span>
      </div>
      <div class="log-terminal" id="logBox">
        <div>جاري قراءة سجل العمليات...</div>
      </div>
    </div>
  </div>

  <script>
    let currentLang = localStorage.getItem('agent_ui_lang') || 'ar';

    const translations = {
      ar: {
        brand: 'وكيل ربط ومزامنة مستودع الأدوية',
        stFb: 'قاعدة بيانات الفايربيرد (ORGA.GDB):',
        stCloud: 'خادم المنصة السحابية:',
        secConn: 'بيانات الربط والاتصال الأساسية (مطلوب 3 بيانات فقط)',
        lblPath: '1. مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):',
        lblIp: '2. عنوان IP الماستر أو السيرفر (Master IP):',
        lblKey: '3. مفتاح الربط والتوكن السحابي (API Token):',
        paceTitle: '🐢 سرعة الرفع: ',
        paceDesc: 'نمط هادئ وخفيف جداً (يحمي داتابيز المخزن وسيرفر السحابة من أي تهنيج)',
        autostartTitle: 'التشغيل التلقائي الذاتي (Auto-Start & Background Sync)',
        autostartDesc: 'يبدأ البرنامج في العمل ذاتياً عند تشغيل الكمبيوتر أو إعادة تشغيله، ويقوم بتحديث البيانات دورياً كل 60 ثانية بدون تدخل يدوي.',
        chkAutostart: 'تشغيل تلقائي مع إقلاع الويندوز',
        btnStart: 'حفظ وبدء المزامنة التلقائية',
        btnPause: 'إيقاف مؤقت',
        btnSave: 'حفظ الإعدادات فقط',
        btnReset: 'إعادة من البداية',
        secProg: 'حالة المزامنة والتقدم المباشر',
        stInvoices: 'الفواتير المرفوعة',
        stReceipts: 'سندات القبض المرفوعة',
        stCusts: 'دليل الصيدليات',
        stStatus: 'حالة الوكيل',
        secLog: 'سجل العمليات المباشر',
        langBtn: 'English 🌐',
        connected: 'متصل بنجاح 🟢',
        disconnected: 'غير متصل 🔴',
        testing: 'جاري الفحص...'
      },
      en: {
        brand: 'XPharma Warehouse Sync Agent',
        stFb: 'Firebird Database (ORGA.GDB):',
        stCloud: 'Cloud Server Backend:',
        secConn: 'Connection Settings (Only 3 fields needed)',
        lblPath: '1. Firebird Database File Path (ORGA.GDB):',
        lblIp: '2. Master Server IP / Host:',
        lblKey: '3. Cloud API Token:',
        paceTitle: '🐢 Upload Pace: ',
        paceDesc: 'Gentle & Light (Protects warehouse DB and server from freezing)',
        autostartTitle: 'Auto-Start & Continuous Background Sync',
        autostartDesc: 'Starts automatically when Windows boots or restarts, and syncs new data continuously every 60 seconds.',
        chkAutostart: 'Auto-start with Windows',
        btnStart: 'Save & Start Auto Sync',
        btnPause: 'Pause Sync',
        btnSave: 'Save Settings Only',
        btnReset: 'Reset & Re-sync',
        secProg: 'Live Sync Progress & Status',
        stInvoices: 'Uploaded Invoices',
        stReceipts: 'Uploaded Receipts',
        stCusts: 'Pharmacies',
        stStatus: 'Agent Status',
        secLog: 'Live Operation Log',
        langBtn: 'العربية 🌐',
        connected: 'Connected 🟢',
        disconnected: 'Disconnected 🔴',
        testing: 'Checking...'
      }
    };

    function applyLanguage(lang) {
      currentLang = lang;
      localStorage.setItem('agent_ui_lang', lang);
      const isAr = lang === 'ar';
      document.getElementById('htmlTag').dir = isAr ? 'rtl' : 'ltr';
      document.getElementById('htmlTag').lang = isAr ? 'ar' : 'en';
      document.body.className = isAr ? '' : 'lang-en';

      const t = translations[lang];
      document.getElementById('t-brand').innerText = t.brand;
      document.getElementById('t-st-fb').innerText = t.stFb;
      document.getElementById('t-st-cloud').innerText = t.stCloud;
      document.getElementById('t-sec-conn').innerText = t.secConn;
      document.getElementById('t-lbl-path').innerText = t.lblPath;
      document.getElementById('t-lbl-ip').innerText = t.lblIp;
      document.getElementById('t-lbl-key').innerText = t.lblKey;
      document.getElementById('t-pace-title').innerText = t.paceTitle;
      document.getElementById('t-pace-desc').innerText = t.paceDesc;
      document.getElementById('t-autostart-title').innerText = t.autostartTitle;
      document.getElementById('t-autostart-desc').innerText = t.autostartDesc;
      document.getElementById('t-chk-autostart').innerText = t.chkAutostart;
      document.getElementById('t-btn-start').innerText = t.btnStart;
      document.getElementById('t-btn-pause').innerText = t.btnPause;
      document.getElementById('t-btn-save').innerText = t.btnSave;
      document.getElementById('t-btn-reset').innerText = t.btnReset;
      document.getElementById('t-sec-prog').innerText = t.secProg;
      document.getElementById('t-st-invoices').innerText = t.stInvoices;
      document.getElementById('t-st-receipts').innerText = t.stReceipts;
      document.getElementById('t-st-custs').innerText = t.stCusts;
      document.getElementById('t-st-status').innerText = t.stStatus;
      document.getElementById('t-sec-log').innerText = t.secLog;
      document.getElementById('langBtn').innerText = t.langBtn;
    }

    function toggleLanguage() {
      applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
    }

    applyLanguage(currentLang);

    let isInitialized = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const t = translations[currentLang];

        // Connection Indicators
        const dotFb = document.getElementById('dotFb');
        const textFb = document.getElementById('textFb');
        if (data.firebird_connected) {
          dotFb.className = 'dot dot-green';
          textFb.innerText = t.connected;
        } else {
          dotFb.className = 'dot dot-red';
          textFb.innerText = t.disconnected;
        }

        const dotCloud = document.getElementById('dotCloud');
        const textCloud = document.getElementById('textCloud');
        if (data.cloud_connected) {
          dotCloud.className = 'dot dot-green';
          textCloud.innerText = t.connected;
        } else {
          dotCloud.className = 'dot dot-red';
          textCloud.innerText = t.disconnected;
        }

        // Fill Form Fields on first load
        if (!isInitialized && data.config) {
          document.getElementById('inPath').value = data.config.firebird.db_path || '';
          document.getElementById('inHost').value = data.config.firebird.host || '127.0.0.1';
          document.getElementById('inKey').value = data.config.cloud.api_key || '';
          if (data.config.sync_mode) {
            document.getElementById('selMode').value = data.config.sync_mode;
          }
          document.getElementById('chkAutoStart').checked = data.config.auto_start !== false;
          isInitialized = true;
        }

        // Progress and Counts
        document.getElementById('cntInvoices').innerText = (data.synced_invoices || 0).toLocaleString();
        document.getElementById('totInvoices').innerText = (data.total_invoices || 0).toLocaleString();
        document.getElementById('cntReceipts').innerText = (data.synced_receipts || 0).toLocaleString();
        document.getElementById('totReceipts').innerText = (data.total_receipts || 0).toLocaleString();
        document.getElementById('cntCusts').innerText = (data.total_customers || 0).toLocaleString();

        const pct = data.progress_percent || 0;
        document.getElementById('progressBar').style.width = pct + '%';
        document.getElementById('currentTask').innerText = data.current_task || 'جاهز';

        const stVal = document.getElementById('stVal');
        const btnStart = document.getElementById('btnStart');
        const btnPause = document.getElementById('btnPause');

        if (data.status === 'syncing') {
          stVal.innerText = currentLang === 'ar' ? 'جاري الرفع بهدوء...' : 'Gentle Syncing...';
          stVal.style.color = '#38bdf8';
          btnStart.style.display = 'none';
          btnPause.style.display = 'flex';
        } else if (data.status === 'paused') {
          stVal.innerText = currentLang === 'ar' ? 'متوقف مؤقتاً' : 'Paused';
          stVal.style.color = '#f59e0b';
          btnStart.style.display = 'flex';
          btnPause.style.display = 'none';
        } else if (data.status === 'success') {
          stVal.innerText = currentLang === 'ar' ? 'نشط ويعمل تلقائياً في الخلفية' : 'Active Auto-Sync (Background)';
          stVal.style.color = '#10b981';
          btnStart.style.display = 'none';
          btnPause.style.display = 'flex';
        } else {
          stVal.innerText = currentLang === 'ar' ? 'نشط في الخلفية' : 'Background Active';
          stVal.style.color = '#10b981';
          btnStart.style.display = 'flex';
          btnPause.style.display = 'none';
        }

        // Logs
        if (data.logs && data.logs.length > 0) {
          const logBox = document.getElementById('logBox');
          logBox.innerHTML = data.logs.map(l => '<div>' + escapeHtml(l) + '</div>').join('');
          logBox.scrollTop = logBox.scrollHeight;
        }
      } catch (_) {}
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.innerText = text;
      return div.innerHTML;
    }

    async function saveSettingsOnly() {
      const dbPath = document.getElementById('inPath').value;
      const host = document.getElementById('inHost').value;
      const key = document.getElementById('inKey').value;
      const mode = document.getElementById('selMode').value;
      const autoStart = document.getElementById('chkAutoStart').checked;
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_path: dbPath, host: host, api_key: key, sync_mode: mode, auto_start: autoStart, auto_sync: true, language: currentLang })
      });
      alert(currentLang === 'ar' ? 'تم حفظ الإعدادات بنجاح!' : 'Settings saved successfully!');
      fetchStatus();
    }

    async function startSync() {
      const dbPath = document.getElementById('inPath').value;
      const host = document.getElementById('inHost').value;
      const key = document.getElementById('inKey').value;
      const mode = document.getElementById('selMode').value;
      const autoStart = document.getElementById('chkAutoStart').checked;

      if (!dbPath) {
        alert(currentLang === 'ar' ? 'يرجى إدخال مسار ملف قاعدة البيانات أولاً' : 'Please enter database path first');
        return;
      }
      if (!key) {
        alert(currentLang === 'ar' ? 'يرجى إدخال مفتاح التوكن السحابي (API Token)' : 'Please enter cloud API token');
        return;
      }

      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_path: dbPath, host: host, api_key: key, sync_mode: mode, auto_start: autoStart, auto_sync: true, language: currentLang })
      });

      await fetch('/api/start', { method: 'POST' });
      fetchStatus();
    }

    async function pauseSync() {
      await fetch('/api/pause', { method: 'POST' });
      fetchStatus();
    }

    async function resetSync() {
      if (confirm(currentLang === 'ar' ? 'هل تريد بالتأكيد إعادة رفع البيانات من البداية؟' : 'Are you sure you want to re-sync from beginning?')) {
        await fetch('/api/reset', { method: 'POST' });
        fetchStatus();
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 2000);
  </script>
</body>
</html>
`

// -----------------------------------------------------------------------------
// Program Entrypoint
// -----------------------------------------------------------------------------

func main() {
	initWindowsConsole()

	noWindow := flag.Bool("no-window", false, "Do not auto-open the GUI window")
	daemon := flag.Bool("daemon", false, "Run in background daemon mode without window")
	flag.Parse()

	cfg := loadConfig()

	log.Println("==========================================================")
	log.Println("   XPharma Warehouse Sync Agent - وكيل مزامنة المستودع     ")
	log.Println("==========================================================")
	log.Printf("🔹 رابط السحابة: %s", cfg.Cloud.APIURL)
	log.Printf("🔹 خادم الفايربيرد: %s:%d", cfg.Firebird.Host, cfg.Firebird.Port)
	log.Printf("🔹 مسار قاعدة البيانات: %s", cfg.Firebird.DBPath)
	log.Printf("🔹 نمط المزامنة: %s (دفعات %d سجل مع راحة %d مللي ثانية)", cfg.SyncMode, cfg.BatchSize, cfg.BatchDelayMs)
	log.Printf("🔹 التشغيل التلقائي مع فتح الويندوز: %v", cfg.AutoStart)

	// Ensure Windows Auto-Start is configured according to config
	if cfg.AutoStart {
		_ = setWindowsAutoStart(true)
		state.Lock()
		state.AutoStartEnabled = true
		state.Unlock()
	}

	// Start Internal Web GUI Server in background
	go func() {
		startInternalServer(cfg)
	}()

	appURL := fmt.Sprintf("http://127.0.0.1:%d", cfg.WebPort)

	// If launched with -daemon (e.g. from Windows boot):
	// Do NOT open window automatically, start continuous daemon directly
	if *daemon {
		log.Println("🔄 يعمل البرنامج في خلفية الويندوز بمزامنة مستمرة تلقائية...")
		go startContinuousDaemon(cfg)
	} else if !*noWindow {
		// Launched by user double clicking:
		// Open the clean desktop app window
		log.Printf("🚀 تم تشغيل واجهة البرنامج على: %s", appURL)
		go func() {
			time.Sleep(600 * time.Millisecond)
			openAppWindow(appURL)
		}()

		// If configured with valid settings, also run continuous sync in background
		if cfg.Firebird.DBPath != "" && cfg.Cloud.APIKey != "" && cfg.AutoSync {
			go startContinuousDaemon(cfg)
		}
	}

	// Auto-test connections on start
	go func() {
		time.Sleep(1 * time.Second)
		fbOk, cloudOk := checkConnections(cfg)
		state.Lock()
		state.FirebirdConnected = fbOk
		state.CloudConnected = cloudOk
		state.Unlock()
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigChan:
		log.Printf("Stop signal received (%v). Exiting cleanly...", sig)
	}
}
