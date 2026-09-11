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
	"math"
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
		LastReturnID  int64 `json:"last_return_id"`
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
	TotalReturns      int       `json:"total_returns"`
	SyncedReturns     int       `json:"synced_returns"`
	TotalLedger       int       `json:"total_ledger"`
	SyncedLedger      int       `json:"synced_ledger"`
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
	if len(state.Logs) > 100 {
		state.Logs = state.Logs[len(state.Logs)-100:]
	}
}

// -----------------------------------------------------------------------------
// Windows Process & Auto-Start Management (Hidden Execution)
// -----------------------------------------------------------------------------

func runHiddenCommand(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
	return cmd.Run()
}

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
		// 1. Add to HKCU Run Key (Runs automatically on login without requiring Administrator rights)
		_ = runHiddenCommand("reg", "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
			"/v", "XPharmaSyncAgent",
			"/t", "REG_SZ",
			"/d", fmt.Sprintf("\"%s\" -daemon", exePath),
			"/f")

		// 2. Register in Task Scheduler on logon
		_ = runHiddenCommand("schtasks", "/create",
			"/tn", "XPharmaSyncAgent",
			"/tr", fmt.Sprintf("\"%s\" -daemon", exePath),
			"/sc", "onlogon",
			"/f")

		addLog("تم تفعيل التشغيل التلقائي مع فتح الويندوز بنجاح (Auto-Start Enabled).")
		return nil
	} else {
		_ = runHiddenCommand("reg", "delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
			"/v", "XPharmaSyncAgent",
			"/f")

		_ = runHiddenCommand("schtasks", "/delete", "/tn", "XPharmaSyncAgent", "/f")

		addLog("تم إيقاف التشغيل التلقائي مع فتح الويندوز.")
		return nil
	}
}

func isWindowsAutoStartEnabled() bool {
	if runtime.GOOS != "windows" {
		return false
	}
	cmd := exec.Command("reg", "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "XPharmaSyncAgent")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
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
	// 1. Try Microsoft Edge in standalone App Mode (No browser address bar, looks like a desktop application)
	edgePaths := []string{
		`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
		`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
	}
	for _, p := range edgePaths {
		if _, err := os.Stat(p); err == nil {
			cmd := exec.Command(p, fmt.Sprintf("--app=%s", url), "--window-size=1040,780")
			if runtime.GOOS == "windows" {
				cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			}
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
			cmd := exec.Command(p, fmt.Sprintf("--app=%s", url), "--window-size=1040,780")
			if runtime.GOOS == "windows" {
				cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			}
			if err := cmd.Start(); err == nil {
				return
			}
		}
	}

	// 3. Fallback to default browser
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
	_ = cmd.Start()
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
	if fb.DBPath == "" {
		return nil, fmt.Errorf("مسار قاعدة البيانات فارغ")
	}

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

func discoverReturnsTable(db *sql.DB) string {
	candidates := []string{
		"RET_INVOICES_H",
		"INVOICES_RET_H",
		"RETURNS_H",
		"RETURN_INVOICES_H",
		"INVOICE_RET_H",
		"RET_INVOICE_H",
	}
	for _, t := range candidates {
		var cnt int
		err := db.QueryRow(fmt.Sprintf("SELECT FIRST 1 1 FROM %s", t)).Scan(&cnt)
		if err == nil {
			return t
		}
	}
	return ""
}

func extractReturnsBatch(db *sql.DB, tableName string, lastID int64, limit int) ([]ReturnSyncItem, []LedgerSyncItem, int64, error) {
	if tableName == "" {
		return nil, nil, lastID, nil
	}

	rows, err := db.Query(fmt.Sprintf("SELECT FIRST 1 * FROM %s", tableName))
	if err != nil {
		return nil, nil, lastID, err
	}
	cols, _ := rows.Columns()
	rows.Close()

	idCol, dateCol, totCol, discCol, accCol, noteCol := "", "", "", "", "", ""
	for _, c := range cols {
		u := strings.ToUpper(strings.TrimSpace(c))
		if idCol == "" && (strings.Contains(u, "ID") || strings.Contains(u, "CODE") || strings.Contains(u, "NUM")) {
			idCol = c
		}
		if dateCol == "" && strings.Contains(u, "DATE") {
			dateCol = c
		}
		if totCol == "" && (strings.Contains(u, "TOTAL_TOTAL") || strings.Contains(u, "TOTAL") || strings.Contains(u, "NET") || strings.Contains(u, "AMOUNT") || strings.Contains(u, "MONY")) {
			totCol = c
		}
		if discCol == "" && strings.Contains(u, "DISCOUNT") {
			discCol = c
		}
		if accCol == "" && (strings.Contains(u, "ACCOUNT") || strings.Contains(u, "ACC") || strings.Contains(u, "CLIENT") || strings.Contains(u, "PHARM")) {
			accCol = c
		}
		if noteCol == "" && (strings.Contains(u, "NOTE") || strings.Contains(u, "REASON") || strings.Contains(u, "REMARK") || strings.Contains(u, "DESCR")) {
			noteCol = c
		}
	}

	if idCol == "" && len(cols) > 0 {
		idCol = cols[0]
	}
	if dateCol == "" {
		dateCol = idCol
	}

	selectCols := []string{idCol, dateCol}
	if totCol != "" {
		selectCols = append(selectCols, totCol)
	}
	if discCol != "" {
		selectCols = append(selectCols, discCol)
	}
	if accCol != "" {
		selectCols = append(selectCols, accCol)
	}
	if noteCol != "" {
		selectCols = append(selectCols, noteCol)
	}

	q := fmt.Sprintf(`
		SELECT FIRST %d %s
		FROM %s
		WHERE %s > %d
		ORDER BY %s ASC
	`, limit, strings.Join(selectCols, ", "), tableName, idCol, lastID, idCol)

	qRows, err := db.Query(q)
	if err != nil {
		return nil, nil, lastID, err
	}
	defer qRows.Close()

	var retBatch []ReturnSyncItem
	var ledgBatch []LedgerSyncItem
	var maxID int64 = lastID

	for qRows.Next() {
		vals := make([]interface{}, len(selectCols))
		valPtrs := make([]interface{}, len(selectCols))
		for i := range vals {
			valPtrs[i] = &vals[i]
		}
		if err := qRows.Scan(valPtrs...); err != nil {
			continue
		}

		var id int64
		if vals[0] != nil {
			switch v := vals[0].(type) {
			case int64:
				id = v
			case int:
				id = int64(v)
			default:
				fmt.Sscanf(fmt.Sprintf("%v", vals[0]), "%d", &id)
			}
		}
		if id > maxID {
			maxID = id
		}

		dateD := parseDate(vals[1])
		var total, discount float64
		var accountID string = "0"
		var reason string = "مرتجع مبيعات أدوية"

		currIdx := 2
		if totCol != "" && currIdx < len(vals) {
			if vals[currIdx] != nil {
				switch v := vals[currIdx].(type) {
				case float64:
					total = v
				default:
					fmt.Sscanf(fmt.Sprintf("%v", vals[currIdx]), "%f", &total)
				}
			}
			currIdx++
		}
		if discCol != "" && currIdx < len(vals) {
			if vals[currIdx] != nil {
				switch v := vals[currIdx].(type) {
				case float64:
					discount = v
				default:
					fmt.Sscanf(fmt.Sprintf("%v", vals[currIdx]), "%f", &discount)
				}
			}
			currIdx++
		}
		if accCol != "" && currIdx < len(vals) {
			if vals[currIdx] != nil {
				accountID = strings.TrimSpace(fmt.Sprintf("%v", vals[currIdx]))
			}
			currIdx++
		}
		if noteCol != "" && currIdx < len(vals) {
			if vals[currIdx] != nil {
				switch v := vals[currIdx].(type) {
				case []byte:
					reason = decodeText(v)
				default:
					reason = cleanControlChars(strings.TrimSpace(fmt.Sprintf("%v", v)))
				}
			}
		}

		total = math.Abs(total)
		discount = math.Abs(discount)
		net := total - discount
		if net <= 0 {
			net = total
		}
		if reason == "" {
			reason = "مرتجع مبيعات أدوية"
		}

		remoteID := fmt.Sprintf("%d", id)
		retNum := fmt.Sprintf("RET-%d", id)

		retBatch = append(retBatch, ReturnSyncItem{
			RemoteID:     remoteID,
			ReturnNumber: retNum,
			PharmacyCode: accountID,
			ReturnDate:   dateD,
			TotalAmount:  total,
			NetAmount:    net,
			Status:       "approved",
			Reason:       reason,
		})

		ledgBatch = append(ledgBatch, LedgerSyncItem{
			RemoteID:     "RET-" + remoteID,
			PharmacyCode: accountID,
			EntryDate:    dateD,
			DocType:      "مرتجع مبيعات",
			DocNumber:    retNum,
			Debit:        0.00,
			Credit:       net,
			Balance:      0.00,
			Description:  reason,
		})
	}

	return retBatch, ledgBatch, maxID, nil
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
		addLog("محرك المزامنة قيد العمل حالياً.")
		return
	}
	state.IsRunning = true
	state.ShouldPause = false
	state.Status = "syncing"
	state.LastError = ""
	state.CurrentTask = "جاري الاتصال والتحقق من السجلات..."
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

	if cfg.Firebird.DBPath == "" {
		state.Lock()
		state.Status = "idle"
		state.CurrentTask = "مسار قاعدة البيانات غير محدد"
		state.Unlock()
		addLog("تنبيه: مسار ملف قاعدة بيانات الفايربيرد غير محدد.")
		return
	}

	addLog(fmt.Sprintf("بدء الاتصال بقاعدة بيانات الفايربيرد: %s (الخادم: %s:%d)", cfg.Firebird.DBPath, cfg.Firebird.Host, cfg.Firebird.Port))

	db, err := connectFirebird(cfg)
	if err != nil {
		state.Lock()
		state.Status = "error"
		state.LastError = fmt.Sprintf("فشل الاتصال بالفايربيرد: %v", err)
		state.FirebirdConnected = false
		state.CurrentTask = "خطأ في الاتصال بالفايربيرد"
		state.Unlock()
		addLog(fmt.Sprintf("خطأ: تعذر الاتصال بملف قاعدة البيانات (%v). يرجى التأكد من تشغيل خدمة Firebird وصحة المسار.", err))
		return
	}
	defer db.Close()

	state.Lock()
	state.FirebirdConnected = true
	state.Unlock()
	addLog("تم الاتصال بقاعدة بيانات الفايربيرد بنجاح.")

	// 1. Quick indexed counts & returns discovery
	var totalInvoices, totalReceipts, totalReturns int
	_ = db.QueryRow("SELECT COUNT(*) FROM INVOICES_H").Scan(&totalInvoices)
	_ = db.QueryRow("SELECT COUNT(*) FROM INCOME_CASH").Scan(&totalReceipts)

	returnsTable := discoverReturnsTable(db)
	if returnsTable != "" {
		_ = db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", returnsTable)).Scan(&totalReturns)
	}

	state.Lock()
	state.TotalInvoices = totalInvoices
	state.TotalReceipts = totalReceipts
	state.TotalReturns = totalReturns
	state.TotalLedger = totalInvoices + totalReceipts + totalReturns
	state.Unlock()

	if totalReturns > 0 {
		addLog(fmt.Sprintf("فحص المخزن: تم العثور على %d فاتورة، %d سند قبض، و %d مرتجع مبيعات.", totalInvoices, totalReceipts, totalReturns))
	} else {
		addLog(fmt.Sprintf("فحص المخزن: تم العثور على %d فاتورة و %d سند قبض.", totalInvoices, totalReceipts))
	}

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
		addLog("فحص دليل العملاء والصيدليات...")
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

			if len(custList) > 0 {
				addLog(fmt.Sprintf("تم استخراج %d عميل، جاري الرفع للسحابة...", len(custList)))
				for i := 0; i < len(custList); i += 300 {
					end := i + 300
					if end > len(custList) {
						end = len(custList)
					}
					p := IngestionPayload{Customers: custList[i:end]}
					_ = postBatch(cfg.Cloud.APIURL, cfg.Cloud.APIKey, p)
					time.Sleep(300 * time.Millisecond)
				}
				addLog("اكتمل تحديث دليل العملاء بنجاح.")
			}
		}
	}

	// 3. Gentle Indexed Invoices Extraction
	lastInvID := cfg.Cursors.LastInvoiceID
	syncedInvoices := 0

	addLog(fmt.Sprintf("بدء فحص الفواتير من المعرف %d (حجم الدفعة: %d)...", lastInvID, batchSize))

	for {
		state.Lock()
		if state.ShouldPause {
			state.Status = "paused"
			state.CurrentTask = "المزامنة متوقفة مؤقتاً"
			state.Unlock()
			addLog("تم إيقاف المزامنة مؤقتاً.")
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
			addLog(fmt.Sprintf("تنبيه في الاستعلام من جدول الفواتير: %v", err))
			break
		}

		var batch []InvoiceSyncItem
		var ledgBatch []LedgerSyncItem
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
			remoteID := fmt.Sprintf("%d", id)
			invNum := fmt.Sprintf("INV-%d", id)
			pharmaCode := fmt.Sprintf("%d", accountID)

			batch = append(batch, InvoiceSyncItem{
				RemoteID:        remoteID,
				InvoiceNumber:   invNum,
				PharmacyCode:    pharmaCode,
				InvoiceDate:     dateD,
				TotalAmount:     total,
				DiscountAmount:  discount,
				NetAmount:       net,
				PaidAmount:      paid,
				RemainingAmount: rem,
				Status:          "synced",
			})

			ledgBatch = append(ledgBatch, LedgerSyncItem{
				RemoteID:     "INV-" + remoteID,
				PharmacyCode: pharmaCode,
				EntryDate:    dateD,
				DocType:      "فاتورة مبيعات",
				DocNumber:    invNum,
				Debit:        net,
				Credit:       0.00,
				Balance:      0.00,
				Description:  "فاتورة مبيعات أدوية",
			})
		}
		rows.Close() // Release locks immediately

		if len(batch) == 0 {
			break
		}

		payload := IngestionPayload{Invoices: batch, Ledger: ledgBatch}
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
		state.SyncedLedger = syncedInvoices + state.SyncedReceipts + state.SyncedReturns
		if totalInvoices > 0 {
			state.ProgressPercent = (syncedInvoices * 50) / totalInvoices
		}
		state.Unlock()

		addLog(fmt.Sprintf("تم رفع دفعة (%d فاتورة) بنجاح - الإجمالي المرفوع: %d فاتورة.", len(batch), syncedInvoices))

		// Gentle pause between batches
		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}

	// 4. Gentle Indexed Cash Receipts Extraction
	lastRcptID := cfg.Cursors.LastReceiptID
	syncedRcpts := 0

	addLog(fmt.Sprintf("بدء فحص سندات القبض من المعرف %d...", lastRcptID))

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
			addLog(fmt.Sprintf("تنبيه في الاستعلام من جدول سندات القبض: %v", err))
			break
		}

		var batch []CashReceiptSyncItem
		var ledgBatch []LedgerSyncItem
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
			remoteID := fmt.Sprintf("%d", id)
			rcptNum := fmt.Sprintf("RCP-%d", id)
			pharmaCode := fmt.Sprintf("%d", accountID)

			batch = append(batch, CashReceiptSyncItem{
				RemoteID:      remoteID,
				ReceiptNumber: rcptNum,
				PharmacyCode:  pharmaCode,
				ReceiptDate:   dateD,
				Amount:        amount,
				PaymentMethod: "cash",
				CollectorName: collector,
				Notes:         "سند قبض نقدي",
			})

			ledgBatch = append(ledgBatch, LedgerSyncItem{
				RemoteID:     "RCP-" + remoteID,
				PharmacyCode: pharmaCode,
				EntryDate:    dateD,
				DocType:      "سند قبض نقدي",
				DocNumber:    rcptNum,
				Debit:        0.00,
				Credit:       amount,
				Balance:      0.00,
				Description:  fmt.Sprintf("سند تحصيل نقدي - المحصل: %s", collector),
			})
		}
		rows.Close()

		if len(batch) == 0 {
			break
		}

		payload := IngestionPayload{CashReceipts: batch, Ledger: ledgBatch}
		if err := postBatch(cfg.Cloud.APIURL, cfg.Cloud.APIKey, payload); err != nil {
			addLog(fmt.Sprintf("تنبيه أثناء إرسال سندات القبض: %v", err))
			time.Sleep(2 * time.Second)
			continue
		}

		syncedRcpts += len(batch)
		lastRcptID = maxIDInBatch
		cfg.Cursors.LastReceiptID = lastRcptID
		saveConfig(cfg)

		state.Lock()
		state.SyncedReceipts = syncedRcpts
		state.SyncedLedger = state.SyncedInvoices + syncedRcpts + state.SyncedReturns
		state.Unlock()

		addLog(fmt.Sprintf("تم رفع دفعة (%d سند قبض) بنجاح - الإجمالي المرفوع: %d سند.", len(batch), syncedRcpts))

		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}

	// 5. Gentle Indexed Sales Returns Extraction
	if returnsTable != "" {
		lastRetID := cfg.Cursors.LastReturnID
		syncedReturns := 0

		addLog(fmt.Sprintf("بدء فحص مرتجعات المبيعات من المعرف %d (الجدول: %s)...", lastRetID, returnsTable))

		for {
			state.Lock()
			if state.ShouldPause {
				state.Status = "paused"
				state.CurrentTask = "المزامنة متوقفة مؤقتاً"
				state.Unlock()
				addLog("تم إيقاف المزامنة مؤقتاً.")
				return
			}
			state.CurrentTask = fmt.Sprintf("رفع مرتجعات المبيعات بهدوء... تم رفع %d مرتجع", syncedReturns)
			state.Unlock()

			retBatch, ledgBatch, maxID, err := extractReturnsBatch(db, returnsTable, lastRetID, batchSize)
			if err != nil {
				addLog(fmt.Sprintf("تنبيه في استخراج المرتجعات: %v", err))
				break
			}

			if len(retBatch) == 0 {
				break
			}

			payload := IngestionPayload{Returns: retBatch, Ledger: ledgBatch}
			if err := postBatch(cfg.Cloud.APIURL, cfg.Cloud.APIKey, payload); err != nil {
				addLog(fmt.Sprintf("تنبيه أثناء إرسال دفعة المرتجعات: %v", err))
				time.Sleep(2 * time.Second)
				continue
			}

			syncedReturns += len(retBatch)
			lastRetID = maxID
			cfg.Cursors.LastReturnID = lastRetID
			saveConfig(cfg)

			state.Lock()
			state.SyncedReturns = syncedReturns
			state.SyncedLedger = state.SyncedInvoices + state.SyncedReceipts + syncedReturns
			state.Unlock()

			addLog(fmt.Sprintf("تم رفع دفعة (%d مرتجع) بنجاح - الإجمالي المرفوع: %d مرتجع.", len(retBatch), syncedReturns))

			time.Sleep(time.Duration(delayMs) * time.Millisecond)
		}
	}

	state.Lock()
	state.SyncedLedger = state.SyncedInvoices + state.SyncedReceipts + state.SyncedReturns
	state.Status = "success"
	state.CurrentTask = "المزامنة مكتملة وفي وضع المراقبة والتحديث التلقائي المستمر"
	state.ProgressPercent = 100
	state.LastSyncTime = time.Now()
	state.CloudConnected = true
	state.Unlock()

	if isAr {
		addLog(fmt.Sprintf("اكتملت المزامنة بنجاح. المحرك الآن في وضع المراقبة التلقائية كل %d ثانية.", cfg.SyncIntervalSeconds))
	} else {
		addLog(fmt.Sprintf("Sync cycle completed. Continuous monitoring every %d seconds.", cfg.SyncIntervalSeconds))
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
			"total_returns":       state.TotalReturns,
			"synced_returns":      state.SyncedReturns,
			"total_ledger":        state.TotalLedger,
			"synced_ledger":       state.SyncedLedger,
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

	mux.HandleFunc("/api/test", func(w http.ResponseWriter, r *http.Request) {
		fbOk, cloudOk := checkConnections(cfg)
		state.Lock()
		state.FirebirdConnected = fbOk
		state.CloudConnected = cloudOk
		state.Unlock()

		if fbOk {
			addLog(fmt.Sprintf("فحص الاتصال: تم الاتصال بقاعدة بيانات الفايربيرد بنجاح (%s)", cfg.Firebird.DBPath))
		} else {
			addLog(fmt.Sprintf("فحص الاتصال: تعذر الاتصال بملف الفايربيرد (%s:%d - %s). تأكد من صحة المسار وتشغيل خدمة Firebird.", cfg.Firebird.Host, cfg.Firebird.Port, cfg.Firebird.DBPath))
		}

		if cloudOk {
			addLog("فحص الاتصال: تم الاتصال بالسيرفر السحابي بنجاح.")
		} else {
			addLog(fmt.Sprintf("فحص الاتصال: تعذر الاتصال بالسيرفر السحابي (%s).", cfg.Cloud.APIURL))
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{
			"firebird": fbOk,
			"cloud":    cloudOk,
		})
	})

	mux.HandleFunc("/api/start", func(w http.ResponseWriter, r *http.Request) {
		cfg.AutoSync = true
		saveConfig(cfg)
		state.Lock()
		state.ShouldPause = false
		state.Status = "syncing"
		state.Unlock()

		addLog("تم إرسال أمر بدء المزامنة فورياً.")

		// 1. Run sync immediately in background
		go runGentleSync(cfg)

		// 2. Ensure daemon ticker is running
		go startContinuousDaemon(cfg)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "started"})
	})

	mux.HandleFunc("/api/pause", func(w http.ResponseWriter, r *http.Request) {
		cfg.AutoSync = false
		saveConfig(cfg)
		state.Lock()
		state.ShouldPause = true
		state.Status = "paused"
		state.Unlock()
		addLog("تم إيقاف المزامنة مؤقتاً.")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "paused"})
	})

	mux.HandleFunc("/api/reset", func(w http.ResponseWriter, r *http.Request) {
		cfg.Cursors.LastInvoiceID = 0
		cfg.Cursors.LastReceiptID = 0
		cfg.Cursors.LastReturnID = 0
		saveConfig(cfg)
		state.Lock()
		state.SyncedInvoices = 0
		state.SyncedReceipts = 0
		state.SyncedReturns = 0
		state.SyncedLedger = 0
		state.ProgressPercent = 0
		state.ShouldPause = false
		state.Unlock()
		addLog("تمت إعادة تعيين مؤشرات المزامنة للبدء من أول سجل.")
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
// App Window Interface (HTML/CSS/JS) - Enterprise Clean Design (No Emojis)
// -----------------------------------------------------------------------------

const appHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl" id="htmlTag">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XPharma Sync Agent | وكيل مزامنة المستودع</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card: #0f172a;
      --card-hover: #131d35;
      --border: rgba(148, 163, 184, 0.12);
      --border-focus: rgba(59, 130, 246, 0.5);
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-sub: #64748b;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.1);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.1);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.1);
      --font-ar: 'Cairo', system-ui, sans-serif;
      --font-en: 'Inter', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', 'Consolas', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      background-image: radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.12) 0%, transparent 60%);
      color: var(--text);
      font-family: var(--font-ar);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }

    body.lang-en { font-family: var(--font-en); }
    body.lang-en .num { font-family: var(--font-en); }

    /* Top Navigation Bar */
    .topbar {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #2563eb, #0ea5e9);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }

    .brand-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.2px;
    }

    .brand-sub {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .brand-sub .version {
      background: rgba(255, 255, 255, 0.08);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      color: #93c5fd;
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .daemon-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #34d399;
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulse-ring 2s infinite;
    }

    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
      70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    .btn-lang {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }

    .btn-lang:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Main Container */
    .main {
      padding: 20px 24px;
      max-width: 1020px;
      margin: 0 auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
    }

    /* Connection Status Cards */
    .status-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    @media (max-width: 720px) {
      .status-grid { grid-template-columns: 1fr; }
    }

    .status-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: border-color 0.2s;
    }

    .status-card:hover { border-color: rgba(148, 163, 184, 0.25); }

    .status-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-icon-box {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
    }

    .status-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }

    .status-sub {
      font-size: 11px;
      color: var(--text-sub);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-ok {
      background: var(--success-bg);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .badge-err {
      background: var(--danger-bg);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .badge-wait {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.2);
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .badge-ok .badge-dot { background: #10b981; }
    .badge-err .badge-dot { background: #ef4444; }
    .badge-wait .badge-dot { background: #3b82f6; }

    /* Surface Card */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .card-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .card-icon {
      color: #60a5fa;
      display: flex;
      align-items: center;
    }

    .card-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }

    .card-subtitle {
      font-size: 11px;
      color: var(--text-sub);
    }

    /* Form Fields */
    .form-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 14px;
    }

    @media (max-width: 700px) {
      .form-grid { grid-template-columns: 1fr; }
    }

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
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      color: #64748b;
      display: flex;
      align-items: center;
      pointer-events: none;
    }

    [dir="rtl"] .input-icon { right: 12px; }
    [dir="ltr"] .input-icon { left: 12px; }

    .input-toggle {
      position: absolute;
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 4px;
      transition: color 0.15s;
    }

    .input-toggle:hover { color: var(--text); }

    [dir="rtl"] .input-toggle { left: 12px; }
    [dir="ltr"] .input-toggle { right: 12px; }

    .form-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border);
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      font-family: inherit;
      transition: all 0.2s;
    }

    [dir="rtl"] .form-input.has-icon { padding-right: 38px; }
    [dir="ltr"] .form-input.has-icon { padding-left: 38px; }

    [dir="rtl"] .form-input.has-toggle { padding-left: 38px; }
    [dir="ltr"] .form-input.has-toggle { padding-right: 38px; }

    .form-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
      background: rgba(0, 0, 0, 0.5);
    }

    /* Pacing Selector */
    .pace-container {
      margin-top: 14px;
      background: rgba(37, 99, 235, 0.04);
      border: 1px solid rgba(37, 99, 235, 0.18);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .pace-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .pace-text-title {
      font-size: 12px;
      font-weight: 700;
      color: #93c5fd;
    }

    .pace-text-sub {
      font-size: 11px;
      color: var(--text-muted);
    }

    .pace-select {
      background: #1e293b;
      color: white;
      border: 1px solid var(--border);
      padding: 7px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
      cursor: pointer;
    }

    .pace-select:focus { border-color: #3b82f6; }

    /* Auto-Start Switch Box */
    .autostart-container {
      margin-top: 12px;
      background: rgba(16, 185, 129, 0.04);
      border: 1px solid rgba(16, 185, 129, 0.18);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .autostart-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .autostart-title {
      font-size: 13px;
      font-weight: 700;
      color: #34d399;
    }

    .autostart-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Modern Toggle Switch */
    .switch {
      position: relative;
      display: inline-block;
      width: 46px;
      height: 24px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #334155;
      transition: .25s ease-in-out;
      border-radius: 24px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .25s ease-in-out;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    input:checked + .slider {
      background-color: #10b981;
    }

    input:checked + .slider:before {
      transform: translateX(22px);
    }

    [dir="rtl"] input:checked + .slider:before {
      transform: translateX(22px);
    }

    /* Actions Bar */
    .actions-bar {
      display: flex;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }

    .btn {
      padding: 9px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      font-family: inherit;
    }

    .btn-primary {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, #1d4ed8, #1e40af);
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);
    }

    .btn-primary:active { transform: translateY(1px); }

    .btn-secondary {
      background: #1e293b;
      color: var(--text);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: #283548;
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-warning {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .btn-warning:hover { background: rgba(245, 158, 11, 0.25); }

    .btn-danger {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }

    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.22);
      color: #fca5a5;
    }

    /* Progress & Metrics */
    .progress-wrap {
      background: rgba(0, 0, 0, 0.35);
      border-radius: 8px;
      height: 8px;
      overflow: hidden;
      margin: 12px 0 16px 0;
      border: 1px solid var(--border);
      position: relative;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #2563eb, #38bdf8);
      width: 0%;
      transition: width 0.4s ease;
      border-radius: 8px;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 10px;
    }

    @media (max-width: 950px) {
      .stats-row { grid-template-columns: repeat(3, 1fr); }
    }

    @media (max-width: 580px) {
      .stats-row { grid-template-columns: repeat(2, 1fr); }
    }

    .stat-card {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: relative;
    }

    .stat-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .stat-card-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .stat-card-icon {
      color: #64748b;
    }

    .stat-card-val {
      font-size: 20px;
      font-weight: 700;
      color: white;
      font-family: var(--font-en);
      margin-top: 2px;
    }

    .stat-card-denom {
      color: var(--text-sub);
      font-size: 13px;
      font-weight: 500;
    }

    /* Terminal Log Window */
    .terminal-window {
      background: #040711;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }

    .terminal-header {
      background: #0b1120;
      border-bottom: 1px solid var(--border);
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .terminal-dots {
      display: flex;
      gap: 6px;
    }

    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .dot-close { background: #ef4444; }
    .dot-min { background: #f59e0b; }
    .dot-max { background: #10b981; }

    .terminal-title {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .terminal-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-copy {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
    }

    .btn-copy:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
    }

    .terminal-body {
      padding: 12px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #94a3b8;
      height: 170px;
      overflow-y: auto;
      line-height: 1.6;
      direction: ltr;
      text-align: left;
    }

    .terminal-body::-webkit-scrollbar { width: 6px; }
    .terminal-body::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }

    /* Toast Notification Banner */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #1e293b;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 20px;
      border-radius: 10px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 100;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    .toast-success { border-color: rgba(16, 185, 129, 0.4); color: #34d399; }
    .toast-error { border-color: rgba(239, 68, 68, 0.4); color: #f87171; }
    .toast-info { border-color: rgba(59, 130, 246, 0.4); color: #60a5fa; }

    /* Confirmation Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      z-index: 99;
    }

    .modal-backdrop.show {
      opacity: 1;
      pointer-events: auto;
    }

    .modal {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 14px;
      width: 90%;
      max-width: 440px;
      padding: 24px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      transform: scale(0.95);
      transition: transform 0.2s;
    }

    .modal-backdrop.show .modal { transform: scale(1); }

    .modal-title {
      font-size: 16px;
      font-weight: 700;
      color: white;
      margin-bottom: 8px;
    }

    .modal-desc {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 20px;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  </style>
</head>
<body>
  <!-- Top Navigation Bar -->
  <div class="topbar">
    <div class="brand">
      <div class="brand-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <div>
        <div class="brand-title" id="t-brand">وكيل مزامنة مستودع الأدوية</div>
        <div class="brand-sub">
          <span>XPharma Sync Agent</span>
          <span class="version">v2.4 Enterprise</span>
        </div>
      </div>
    </div>

    <div class="topbar-right">
      <div class="daemon-pill">
        <span class="pulse-dot"></span>
        <span id="t-daemon-live">يعمل في الخلفية</span>
      </div>
      <button class="btn-lang" onclick="toggleLanguage()" id="langBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span id="t-lang-text">English</span>
      </button>
    </div>
  </div>

  <!-- Main View -->
  <div class="main">
    <!-- Live Status Cards -->
    <div class="status-grid">
      <!-- Firebird DB Status -->
      <div class="status-card">
        <div class="status-info">
          <div class="status-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          </div>
          <div>
            <div class="status-title" id="t-st-fb">قاعدة بيانات الفايربيرد (ORGA.GDB)</div>
            <div class="status-sub" id="subFb">Firebird 2.5 / Port 3050</div>
          </div>
        </div>
        <div class="badge badge-wait" id="badgeFb">
          <span class="badge-dot"></span>
          <span id="textFb">جاري الفحص...</span>
        </div>
      </div>

      <!-- Cloud Status -->
      <div class="status-card">
        <div class="status-info">
          <div class="status-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
          </div>
          <div>
            <div class="status-title" id="t-st-cloud">خادم المنصة السحابية</div>
            <div class="status-sub">api.xpharma.cloud</div>
          </div>
        </div>
        <div class="badge badge-wait" id="badgeCloud">
          <span class="badge-dot"></span>
          <span id="textCloud">جاري الفحص...</span>
        </div>
      </div>
    </div>

    <!-- Connection Configuration Form -->
    <div class="card">
      <div class="card-header">
        <div class="card-title-group">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div>
            <div class="card-title" id="t-sec-conn">بيانات الربط والاتصال الأساسية</div>
            <div class="card-subtitle" id="t-sec-conn-sub">مطلوب 3 حقول فقط لبدء عملية المزامنة</div>
          </div>
        </div>
      </div>

      <div class="form-grid">
        <!-- DB Path -->
        <div class="form-group">
          <label class="form-label" id="t-lbl-path">
            <span>مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):</span>
          </label>
          <div class="input-wrapper">
            <div class="input-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
            </div>
            <input type="text" class="form-input has-icon" id="inPath" placeholder="D:\ORGA_SOFT\DATA\ORGA.GDB" />
          </div>
        </div>

        <!-- Master Host / IP -->
        <div class="form-group">
          <label class="form-label" id="t-lbl-ip">
            <span>عنوان IP الماستر أو السيرفر (Master IP):</span>
          </label>
          <div class="input-wrapper">
            <div class="input-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
            </div>
            <input type="text" class="form-input has-icon" id="inHost" placeholder="127.0.0.1" />
          </div>
        </div>

        <!-- API Token -->
        <div class="form-group full">
          <label class="form-label" id="t-lbl-key">
            <span>مفتاح التوكن السحابي (Cloud API Token):</span>
          </label>
          <div class="input-wrapper">
            <div class="input-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
            </div>
            <input type="password" class="form-input has-icon has-toggle" id="inKey" placeholder="xph_agt_..." />
            <button type="button" class="input-toggle" onclick="togglePasswordVisibility()" title="عرض / إخفاء التوكن">
              <svg id="eyeIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Sync Pacing Mode -->
      <div class="pace-container">
        <div class="pace-info">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>
          <div>
            <div class="pace-text-title" id="t-pace-title">معدل تدفق المزامنة (Throttling Mode)</div>
            <div class="pace-text-sub" id="t-pace-desc">نمط هادئ وخفيف يحمي أداء وسرعة أجهزة المبيعات بالمستودع</div>
          </div>
        </div>
        <select class="pace-select" id="selMode">
          <option value="gentle" selected>هادئ وخفيف (100 سجل مع راحة 1.5 ثانية - موصى به)</option>
          <option value="balanced">متوازن (150 سجل مع راحة 0.8 ثانية)</option>
          <option value="fast">سريع (300 سجل مع راحة 0.3 ثانية)</option>
        </select>
      </div>

      <!-- Auto-Start with Windows -->
      <div class="autostart-container">
        <div class="autostart-info">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <div>
            <div class="autostart-title" id="t-autostart-title">التشغيل التلقائي مع إقلاع النظام (Windows Auto-Start)</div>
            <div class="autostart-sub" id="t-autostart-desc">يبدأ البرنامج تلقائياً في الخلفية عند إعادة تشغيل الكمبيوتر، ويستمر في التحديث كل دقيقة.</div>
          </div>
        </div>
        <label class="switch">
          <input type="checkbox" id="chkAutoStart" checked>
          <span class="slider"></span>
        </label>
      </div>

      <!-- Action Buttons -->
      <div class="actions-bar">
        <button class="btn btn-primary" id="btnStart" onclick="startSync()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span id="t-btn-start">حفظ وبدء المزامنة</span>
        </button>

        <button class="btn btn-warning" id="btnPause" onclick="pauseSync()" style="display:none;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          <span id="t-btn-pause">إيقاف مؤقت</span>
        </button>

        <button class="btn btn-secondary" onclick="testConnectionNow()" id="btnTestConn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span id="t-btn-test">فحص الاتصال</span>
        </button>

        <button class="btn btn-secondary" onclick="saveSettingsOnly()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <span id="t-btn-save">حفظ الإعدادات فقط</span>
        </button>

        <button class="btn btn-danger" onclick="openResetModal()" title="إعادة مزامنة البيانات من البداية">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
          <span id="t-btn-reset">إعادة من البداية</span>
        </button>
      </div>
    </div>

    <!-- Live Progress & Metrics -->
    <div class="card">
      <div class="card-header">
        <div class="card-title-group">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div>
            <div class="card-title" id="t-sec-prog">حالة المزامنة والتقدم المباشر</div>
            <div class="card-subtitle" id="currentTask">جاهز للبدء</div>
          </div>
        </div>
      </div>

      <div class="progress-wrap">
        <div class="progress-bar" id="progressBar"></div>
      </div>

      <div class="stats-row">
        <!-- Invoices -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title" id="t-st-invoices">الفواتير المرفوعة</span>
            <div class="stat-card-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
          </div>
          <div class="stat-card-val"><span id="cntInvoices">0</span> <span class="stat-card-denom">/ <span id="totInvoices">0</span></span></div>
        </div>

        <!-- Cash Receipts -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title" id="t-st-receipts">سندات القبض</span>
            <div class="stat-card-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            </div>
          </div>
          <div class="stat-card-val"><span id="cntReceipts">0</span> <span class="stat-card-denom">/ <span id="totReceipts">0</span></span></div>
        </div>

        <!-- Sales Returns -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title" id="t-st-returns">مرتجع المبيعات</span>
            <div class="stat-card-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </div>
          </div>
          <div class="stat-card-val"><span id="cntReturns">0</span> <span class="stat-card-denom">/ <span id="totReturns">0</span></span></div>
        </div>

        <!-- Account Movements (Ledger) -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title" id="t-st-ledger">كشف الحساب</span>
            <div class="stat-card-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            </div>
          </div>
          <div class="stat-card-val" id="cntLedger">0</div>
        </div>

        <!-- Customers -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title" id="t-st-custs">دليل العملاء</span>
            <div class="stat-card-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
          </div>
          <div class="stat-card-val" id="cntCusts">0</div>
        </div>

        <!-- Agent Status -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title" id="t-st-status">حالة المحرك</span>
            <div class="stat-card-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
          </div>
          <div class="stat-card-val" id="stVal" style="font-size: 13px; color: #94a3b8; margin-top: 6px;">جاهز لبدء المزامنة</div>
        </div>
      </div>
    </div>

    <!-- Live Operation Log Terminal -->
    <div class="terminal-window">
      <div class="terminal-header">
        <div class="terminal-dots">
          <div class="terminal-dot dot-close"></div>
          <div class="terminal-dot dot-min"></div>
          <div class="terminal-dot dot-max"></div>
        </div>
        <div class="terminal-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
          <span id="t-sec-log">سجل النشاط والعمليات المباشر</span>
        </div>
        <div class="terminal-actions">
          <button class="btn-copy" onclick="copyTerminalLogs()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span id="t-btn-copy">نسخ السجل</span>
          </button>
        </div>
      </div>
      <div class="terminal-body" id="logBox">
        <div>جاري قراءة سجل العمليات والمزامنة...</div>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast" class="toast"></div>

  <!-- Reset Confirmation Modal -->
  <div id="resetModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-title" id="t-modal-title">تأكيد إعادة المزامنة من البداية</div>
      <div class="modal-desc" id="t-modal-desc">
        سيتم حفظ البيانات المدخلة وتصفير مؤشرات الرفع للبدء بنسخ كافة الفواتير والسجلات التاريخية من جديد وبشكل هادئ. لن تُحذف أي بيانات سحابية.
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeResetModal()" id="t-modal-cancel">إلغاء</button>
        <button class="btn btn-danger" onclick="confirmResetSync()" id="t-modal-confirm">تأكيد والبدء الآن</button>
      </div>
    </div>
  </div>

  <script>
    let currentLang = localStorage.getItem('agent_ui_lang') || 'ar';
    let isInitialized = false;

    const translations = {
      ar: {
        brand: 'وكيل مزامنة مستودع الأدوية',
        daemonLive: 'يعمل في الخلفية',
        stFb: 'قاعدة بيانات الفايربيرد (ORGA.GDB)',
        stCloud: 'خادم المنصة السحابية',
        secConn: 'بيانات الربط والاتصال الأساسية',
        secConnSub: 'مطلوب 3 حقول فقط لبدء عملية المزامنة',
        lblPath: 'مسار ملف قاعدة بيانات الفايربيرد (Firebird DB Path):',
        lblIp: 'عنوان IP الماستر أو السيرفر (Master IP):',
        lblKey: 'مفتاح التوكن السحابي (Cloud API Token):',
        paceTitle: 'معدل تدفق المزامنة (Throttling Mode)',
        paceDesc: 'نمط هادئ وخفيف يحمي أداء وسرعة أجهزة المبيعات بالمستودع',
        autostartTitle: 'التشغيل التلقائي مع إقلاع النظام (Windows Auto-Start)',
        autostartDesc: 'يبدأ البرنامج تلقائياً في الخلفية عند إعادة تشغيل الكمبيوتر، ويستمر في التحديث كل دقيقة.',
        btnStart: 'حفظ وبدء المزامنة',
        btnPause: 'إيقاف مؤقت',
        btnTest: 'فحص الاتصال',
        btnSave: 'حفظ الإعدادات فقط',
        btnReset: 'إعادة من البداية',
        secProg: 'حالة المزامنة والتقدم المباشر',
        stInvoices: 'الفواتير المرفوعة',
        stReceipts: 'سندات القبض',
        stReturns: 'مرتجع المبيعات',
        stLedger: 'كشف الحساب',
        stCusts: 'دليل العملاء',
        stStatus: 'حالة المحرك',
        secLog: 'سجل النشاط والعمليات المباشر',
        btnCopy: 'نسخ السجل',
        langBtn: 'English',
        connected: 'متصل بنجاح',
        disconnected: 'غير متصل',
        testing: 'جاري الفحص...',
        modalTitle: 'تأكيد إعادة المزامنة من البداية',
        modalDesc: 'سيتم حفظ البيانات المدخلة وتصفير مؤشرات الرفع للبدء بنسخ كافة الفواتير والسجلات التاريخية من جديد وبشكل هادئ. لن تُحذف أي بيانات سحابية.',
        modalCancel: 'إلغاء',
        modalConfirm: 'تأكيد والبدء الآن',
        toastSaved: 'تم حفظ الإعدادات بنجاح',
        toastCopied: 'تم نسخ السجل إلى الحافظة'
      },
      en: {
        brand: 'XPharma Warehouse Sync Agent',
        daemonLive: 'Active Background Daemon',
        stFb: 'Firebird Database (ORGA.GDB)',
        stCloud: 'Cloud Platform Backend',
        secConn: 'Connection Settings',
        secConnSub: 'Only 3 fields required for complete synchronization',
        lblPath: 'Firebird DB Path (ORGA.GDB):',
        lblIp: 'Master Host / Server IP:',
        lblKey: 'Cloud API Token:',
        paceTitle: 'Sync Pacing (Throttling Mode)',
        paceDesc: 'Gentle mode protects local database and sales terminals from locks',
        autostartTitle: 'Windows Auto-Start on Boot',
        autostartDesc: 'Launches automatically in background on system reboot and syncs updates continuously.',
        btnStart: 'Save & Start Sync',
        btnPause: 'Pause Sync',
        btnTest: 'Test Connection',
        btnSave: 'Save Settings Only',
        btnReset: 'Reset & Re-sync',
        secProg: 'Live Sync Progress & Health',
        stInvoices: 'Synced Invoices',
        stReceipts: 'Cash Receipts',
        stReturns: 'Sales Returns',
        stLedger: 'Account Movements',
        stCusts: 'Pharmacies',
        stStatus: 'Engine Status',
        secLog: 'Live Synchronization Log',
        btnCopy: 'Copy Log',
        langBtn: 'العربية',
        connected: 'Connected',
        disconnected: 'Disconnected',
        testing: 'Checking...',
        modalTitle: 'Confirm Re-sync from Beginning',
        modalDesc: 'Current settings will be saved, cursors reset to 0, and historical records uploaded freshly with gentle pacing.',
        modalCancel: 'Cancel',
        modalConfirm: 'Confirm & Start',
        toastSaved: 'Settings saved successfully',
        toastCopied: 'Logs copied to clipboard'
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
      document.getElementById('t-daemon-live').innerText = t.daemonLive;
      document.getElementById('t-st-fb').innerText = t.stFb;
      document.getElementById('t-st-cloud').innerText = t.stCloud;
      document.getElementById('t-sec-conn').innerText = t.secConn;
      document.getElementById('t-sec-conn-sub').innerText = t.secConnSub;
      document.getElementById('t-lbl-path').innerText = t.lblPath;
      document.getElementById('t-lbl-ip').innerText = t.lblIp;
      document.getElementById('t-lbl-key').innerText = t.lblKey;
      document.getElementById('t-pace-title').innerText = t.paceTitle;
      document.getElementById('t-pace-desc').innerText = t.paceDesc;
      document.getElementById('t-autostart-title').innerText = t.autostartTitle;
      document.getElementById('t-autostart-desc').innerText = t.autostartDesc;
      document.getElementById('t-btn-start').innerText = t.btnStart;
      document.getElementById('t-btn-pause').innerText = t.btnPause;
      document.getElementById('t-btn-test').innerText = t.btnTest;
      document.getElementById('t-btn-save').innerText = t.btnSave;
      document.getElementById('t-btn-reset').innerText = t.btnReset;
      document.getElementById('t-sec-prog').innerText = t.secProg;
      document.getElementById('t-st-invoices').innerText = t.stInvoices;
      document.getElementById('t-st-receipts').innerText = t.stReceipts;
      document.getElementById('t-st-returns').innerText = t.stReturns;
      document.getElementById('t-st-ledger').innerText = t.stLedger;
      document.getElementById('t-st-custs').innerText = t.stCusts;
      document.getElementById('t-st-status').innerText = t.stStatus;
      document.getElementById('t-sec-log').innerText = t.secLog;
      document.getElementById('t-btn-copy').innerText = t.btnCopy;
      document.getElementById('t-lang-text').innerText = t.langBtn;
      document.getElementById('t-modal-title').innerText = t.modalTitle;
      document.getElementById('t-modal-desc').innerText = t.modalDesc;
      document.getElementById('t-modal-cancel').innerText = t.modalCancel;
      document.getElementById('t-modal-confirm').innerText = t.modalConfirm;
    }

    function toggleLanguage() {
      applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
    }

    function showToast(msg, type = 'success') {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.className = 'toast toast-' + type + ' show';
      setTimeout(() => {
        toast.className = 'toast toast-' + type;
      }, 3200);
    }

    function togglePasswordVisibility() {
      const input = document.getElementById('inKey');
      const icon = document.getElementById('eyeIcon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = '<path d="m9.88 9.88 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
      } else {
        input.type = 'password';
        icon.innerHTML = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
      }
    }

    function openResetModal() {
      document.getElementById('resetModal').classList.add('show');
    }

    function closeResetModal() {
      document.getElementById('resetModal').classList.remove('show');
    }

    async function confirmResetSync() {
      closeResetModal();

      const dbPath = document.getElementById('inPath').value.trim();
      const host = document.getElementById('inHost').value.trim();
      const key = document.getElementById('inKey').value.trim();
      const mode = document.getElementById('selMode').value;
      const autoStart = document.getElementById('chkAutoStart').checked;

      if (!dbPath) {
        showToast(currentLang === 'ar' ? 'يرجى إدخال مسار قاعدة بيانات الفايربيرد أولاً' : 'Please enter database path first', 'error');
        document.getElementById('inPath').focus();
        return;
      }
      if (!key) {
        showToast(currentLang === 'ar' ? 'يرجى إدخال مفتاح التوكن السحابي (API Token)' : 'Please enter cloud API token', 'error');
        document.getElementById('inKey').focus();
        return;
      }

      showToast(currentLang === 'ar' ? 'جاري تصفير المؤشرات وبدء الرفع من البداية...' : 'Resetting cursors and starting sync...', 'info');

      // 1. Save settings
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_path: dbPath,
          host: host,
          api_key: key,
          sync_mode: mode,
          auto_start: autoStart,
          auto_sync: true,
          language: currentLang
        })
      });

      // 2. Reset cursors to 0
      await fetch('/api/reset', { method: 'POST' });

      // 3. Trigger immediate sync
      await fetch('/api/start', { method: 'POST' });

      showToast(currentLang === 'ar' ? 'تمت إعادة التعيين وبدء المزامنة من البداية بنجاح' : 'Sync restarted from beginning');
      fetchStatus();
    }

    async function testConnectionNow() {
      const dbPath = document.getElementById('inPath').value.trim();
      const host = document.getElementById('inHost').value.trim();
      const key = document.getElementById('inKey').value.trim();

      if (!dbPath) {
        showToast(currentLang === 'ar' ? 'يرجى إدخال مسار قاعدة البيانات أولاً' : 'Please enter database path first', 'error');
        document.getElementById('inPath').focus();
        return;
      }

      showToast(currentLang === 'ar' ? 'جاري فحص الاتصال بقاعدة البيانات والسحابة...' : 'Testing connections...', 'info');

      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_path: dbPath,
          host: host,
          api_key: key,
          auto_sync: true,
          language: currentLang
        })
      });

      const res = await fetch('/api/test');
      const data = await res.json();
      if (data.firebird && data.cloud) {
        showToast(currentLang === 'ar' ? 'تم الاتصال بالفايربيرد والسحابة بنجاح!' : 'Connected to Firebird and Cloud successfully!');
      } else if (!data.firebird) {
        showToast(currentLang === 'ar' ? 'تعذر الاتصال بقاعدة بيانات الفايربيرد - تأكد من المسار والخدمة' : 'Firebird connection failed', 'error');
      } else if (!data.cloud) {
        showToast(currentLang === 'ar' ? 'تعذر الاتصال بالسيرفر السحابي' : 'Cloud connection failed', 'error');
      }
      fetchStatus();
    }

    function copyTerminalLogs() {
      const logBox = document.getElementById('logBox');
      navigator.clipboard.writeText(logBox.innerText).then(() => {
        showToast(translations[currentLang].toastCopied);
      });
    }

    applyLanguage(currentLang);

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const t = translations[currentLang];

        // Firebird Status Badge
        const badgeFb = document.getElementById('badgeFb');
        const textFb = document.getElementById('textFb');
        if (data.firebird_connected) {
          badgeFb.className = 'badge badge-ok';
          textFb.innerText = t.connected;
        } else {
          badgeFb.className = 'badge badge-err';
          textFb.innerText = t.disconnected;
        }

        // Cloud Status Badge
        const badgeCloud = document.getElementById('badgeCloud');
        const textCloud = document.getElementById('textCloud');
        if (data.cloud_connected) {
          badgeCloud.className = 'badge badge-ok';
          textCloud.innerText = t.connected;
        } else {
          badgeCloud.className = 'badge badge-err';
          textCloud.innerText = t.disconnected;
        }

        // Fill form fields once if not populated by user
        if (!isInitialized && data.config) {
          const p = document.getElementById('inPath');
          if (!p.value) p.value = data.config.firebird.db_path || '';
          const h = document.getElementById('inHost');
          if (!h.value) h.value = data.config.firebird.host || '127.0.0.1';
          const k = document.getElementById('inKey');
          if (!k.value) k.value = data.config.cloud.api_key || '';
          if (data.config.sync_mode) {
            document.getElementById('selMode').value = data.config.sync_mode;
          }
          document.getElementById('chkAutoStart').checked = data.config.auto_start !== false;
          isInitialized = true;
        }

        // Counter Numbers
        document.getElementById('cntInvoices').innerText = (data.synced_invoices || 0).toLocaleString();
        document.getElementById('totInvoices').innerText = (data.total_invoices || 0).toLocaleString();
        document.getElementById('cntReceipts').innerText = (data.synced_receipts || 0).toLocaleString();
        document.getElementById('totReceipts').innerText = (data.total_receipts || 0).toLocaleString();
        document.getElementById('cntReturns').innerText = (data.synced_returns || 0).toLocaleString();
        document.getElementById('totReturns').innerText = (data.total_returns || 0).toLocaleString();
        document.getElementById('cntLedger').innerText = (data.synced_ledger || 0).toLocaleString();
        document.getElementById('cntCusts').innerText = (data.total_customers || 0).toLocaleString();

        // Progress
        const pct = data.progress_percent || 0;
        document.getElementById('progressBar').style.width = pct + '%';
        document.getElementById('currentTask').innerText = data.current_task || 'جاهز للبدء';

        // Engine Status Text & Action Buttons
        const stVal = document.getElementById('stVal');
        const btnStart = document.getElementById('btnStart');
        const btnPause = document.getElementById('btnPause');
        const btnStartText = document.getElementById('t-btn-start');

        if (data.status === 'syncing') {
          stVal.innerText = currentLang === 'ar' ? 'جاري الرفع والمزامنة...' : 'Syncing in Progress...';
          stVal.style.color = '#38bdf8';
          btnStart.style.display = 'none';
          btnPause.style.display = 'inline-flex';
        } else if (data.status === 'paused') {
          stVal.innerText = currentLang === 'ar' ? 'متوقف مؤقتاً' : 'Paused';
          stVal.style.color = '#f59e0b';
          btnStart.style.display = 'inline-flex';
          btnStartText.innerText = currentLang === 'ar' ? 'استئناف المزامنة' : 'Resume Sync';
          btnPause.style.display = 'none';
        } else if (data.status === 'success') {
          stVal.innerText = currentLang === 'ar' ? 'مكتمل - مراقبة مستمرة' : 'Completed (Monitoring)';
          stVal.style.color = '#34d399';
          btnStart.style.display = 'inline-flex';
          btnStartText.innerText = currentLang === 'ar' ? 'مزامنة الآن' : 'Sync Now';
          btnPause.style.display = 'none';
        } else if (data.status === 'error') {
          stVal.innerText = currentLang === 'ar' ? 'تنبيه في الاتصال' : 'Connection Error';
          stVal.style.color = '#ef4444';
          btnStart.style.display = 'inline-flex';
          btnStartText.innerText = currentLang === 'ar' ? 'إعادة المحاولة' : 'Retry Sync';
          btnPause.style.display = 'none';
        } else {
          // Status is 'idle'
          stVal.innerText = currentLang === 'ar' ? 'جاهز لبدء المزامنة' : 'Ready to Start';
          stVal.style.color = '#94a3b8';
          btnStart.style.display = 'inline-flex';
          btnStartText.innerText = currentLang === 'ar' ? 'حفظ وبدء المزامنة' : 'Save & Start Sync';
          btnPause.style.display = 'none';
        }

        // Live Logs
        if (data.logs && data.logs.length > 0) {
          const logBox = document.getElementById('logBox');
          const isScrolledToBottom = logBox.scrollHeight - logBox.clientHeight <= logBox.scrollTop + 40;
          logBox.innerHTML = data.logs.map(l => '<div>' + escapeHtml(l) + '</div>').join('');
          if (isScrolledToBottom) {
            logBox.scrollTop = logBox.scrollHeight;
          }
        }
      } catch (_) {}
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.innerText = text;
      return div.innerHTML;
    }

    async function saveSettingsOnly() {
      const dbPath = document.getElementById('inPath').value.trim();
      const host = document.getElementById('inHost').value.trim();
      const key = document.getElementById('inKey').value.trim();
      const mode = document.getElementById('selMode').value;
      const autoStart = document.getElementById('chkAutoStart').checked;

      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_path: dbPath,
          host: host,
          api_key: key,
          sync_mode: mode,
          auto_start: autoStart,
          auto_sync: true,
          language: currentLang
        })
      });

      showToast(translations[currentLang].toastSaved);
      fetchStatus();
    }

    async function startSync() {
      const dbPath = document.getElementById('inPath').value.trim();
      const host = document.getElementById('inHost').value.trim();
      const key = document.getElementById('inKey').value.trim();
      const mode = document.getElementById('selMode').value;
      const autoStart = document.getElementById('chkAutoStart').checked;

      if (!dbPath) {
        showToast(currentLang === 'ar' ? 'يرجى إدخال مسار قاعدة بيانات الفايربيرد أولاً' : 'Please enter database path first', 'error');
        document.getElementById('inPath').focus();
        return;
      }
      if (!key) {
        showToast(currentLang === 'ar' ? 'يرجى إدخال مفتاح التوكن السحابي (API Token)' : 'Please enter cloud API token', 'error');
        document.getElementById('inKey').focus();
        return;
      }

      showToast(currentLang === 'ar' ? 'جاري حفظ الإعدادات وبدء المزامنة...' : 'Saving settings and starting sync...', 'info');

      // 1. Save settings
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_path: dbPath,
          host: host,
          api_key: key,
          sync_mode: mode,
          auto_start: autoStart,
          auto_sync: true,
          language: currentLang
        })
      });

      // 2. Start sync
      await fetch('/api/start', { method: 'POST' });
      showToast(currentLang === 'ar' ? 'تم بدء المزامنة بنجاح' : 'Sync started successfully');
      fetchStatus();
    }

    async function pauseSync() {
      await fetch('/api/pause', { method: 'POST' });
      showToast(currentLang === 'ar' ? 'تم إيقاف المزامنة مؤقتاً' : 'Sync paused');
      fetchStatus();
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

	log.Println("[INIT] XPharma Warehouse Sync Agent starting...")
	log.Printf("[CLOUD] API URL: %s", cfg.Cloud.APIURL)
	log.Printf("[FIREBIRD] Host: %s:%d, DBPath: %s", cfg.Firebird.Host, cfg.Firebird.Port, cfg.Firebird.DBPath)
	log.Printf("[SYNC] Mode: %s (Batch: %d, Delay: %dms)", cfg.SyncMode, cfg.BatchSize, cfg.BatchDelayMs)
	log.Printf("[BOOT] Auto-start with Windows: %v", cfg.AutoStart)

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
		log.Println("[DAEMON] Running continuously in Windows background...")
		go startContinuousDaemon(cfg)
	} else if !*noWindow {
		// Launched by user double clicking:
		// Open the clean desktop app window
		log.Printf("[GUI] Launching application window on: %s", appURL)
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
		log.Printf("[EXIT] Stop signal received (%v). Exiting cleanly...", sig)
	}
}
