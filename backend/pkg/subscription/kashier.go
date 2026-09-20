package subscription

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	DefaultKashierMID       = "MID-51040-472"
	DefaultKashierAPIKey    = "c64c4651-40c5-4a07-afc3-81ecdd5ed324"
	DefaultKashierSecretKey = "f6eed974c4831dddef4682a1f64788b4$279e7363c13f24eae9be43d5323f0a3914ad31b22c4ab96a530b0b55afb61693ece67d85576abe557a76d9ec877ff8a1"
)

type KashierConfig struct {
	MID       string
	APIKey    string
	SecretKey string
	IsLive    bool
}

func getKashierConfig() KashierConfig {
	mid := os.Getenv("KASHIER_MID")
	if mid == "" {
		mid = DefaultKashierMID
	}

	apiKey := os.Getenv("KASHIER_PAYMENT_API_KEY")
	if apiKey == "" {
		apiKey = DefaultKashierAPIKey
	}

	secretKey := os.Getenv("KASHIER_SECRET_KEY")
	if secretKey == "" {
		secretKey = DefaultKashierSecretKey
	}

	mode := strings.ToLower(os.Getenv("KASHIER_MODE"))
	isLive := mode == "live" || mode == "production"

	return KashierConfig{
		MID:       mid,
		APIKey:    apiKey,
		SecretKey: secretKey,
		IsLive:    isLive,
	}
}

func (cfg KashierConfig) BaseURL() string {
	if cfg.IsLive {
		return "https://api.kashier.io"
	}
	return "https://test-api.kashier.io"
}

// Plan Pricing Mapping (EGP)
func getPlanPrice(plan int) float64 {
	switch plan {
	case 1:
		return 100.00
	case 2:
		return 150.00
	case 3:
		return 200.00
	case 4:
		return 250.00
	case 5:
		return 300.00
	default:
		if plan > 5 {
			return float64(plan * 60)
		}
		return 200.00
	}
}

// InitiateKashierSessionRequest
type InitiateKashierSessionRequest struct {
	Email    string `json:"email" binding:"required"`
	Plan     int    `json:"plan" binding:"required"`
	UserName string `json:"user_name"`
	Phone    string `json:"phone"`
}

// InitiateSession creates a secure Kashier v3 payment session and returns sessionUrl
func (s *SubscriptionService) InitiateSession(c *gin.Context) {
	var req InitiateKashierSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البريد الإلكتروني ورقم الباقة مطلوبان"})
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if cleanEmail == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البريد الإلكتروني غير صالح"})
		return
	}

	cfg := getKashierConfig()
	price := getPlanPrice(req.Plan)
	amountStr := fmt.Sprintf("%.2f", price)

	// Order Reference: e.g. XPH-SUB-user-P3-1726712345
	timestamp := time.Now().Unix()
	emailPrefix := strings.Split(cleanEmail, "@")[0]
	if len(emailPrefix) > 10 {
		emailPrefix = emailPrefix[:10]
	}
	orderRef := fmt.Sprintf("XPH-SUB-%s-P%d-%d", emailPrefix, req.Plan, timestamp)

	userName := strings.TrimSpace(req.UserName)
	if userName == "" {
		userName = "دكتور صيدلي"
	}

	payload := map[string]interface{}{
		"amount":           amountStr,
		"currency":         "EGP",
		"merchantId":       cfg.MID,
		"order":            orderRef,
		"type":             "one-time",
		"merchantRedirect": "https://api.xpharma.cloud/v1/subscription/kashier/redirect",
		"display":          "ar",
		"allowedMethods":   "card,wallet",
		"customer": map[string]interface{}{
			"email":     cleanEmail,
			"name":      userName,
			"reference": cleanEmail,
		},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء بيانات الدفع"})
		return
	}

	kashierEndpoint := fmt.Sprintf("%s/v3/payment/sessions", cfg.BaseURL())
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", kashierEndpoint, bytes.NewBuffer(jsonBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل تجهيز طلب الدفع"})
		return
	}

	httpReq.Header.Set("Authorization", cfg.SecretKey)
	httpReq.Header.Set("api-key", cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[Kashier] Request error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "تعذر الاتصال ببوابة الدفع كاشير"})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("[Kashier] Session response (%d): %s", resp.StatusCode, string(respBody))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.JSON(resp.StatusCode, gin.H{
			"error":   "فشل إنشاء جلسة الدفع في كاشير",
			"details": string(respBody),
		})
		return
	}

	var kashierResp struct {
		SessionURL    string `json:"sessionUrl"`
		SessionID     string `json:"sessionId"`
		SessionStatus string `json:"sessionStatus"`
	}
	if err := json.Unmarshal(respBody, &kashierResp); err != nil || kashierResp.SessionURL == "" {
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"session_url": fmt.Sprintf("%s?session=%s", cfg.BaseURL(), orderRef),
			"order_id":    orderRef,
			"amount":      price,
			"plan":        req.Plan,
			"raw":         string(respBody),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"session_url": kashierResp.SessionURL,
		"session_id":  kashierResp.SessionID,
		"order_id":    orderRef,
		"amount":      price,
		"plan":        req.Plan,
	})
}

// Webhook / Callback handler for Kashier
func (s *SubscriptionService) HandleWebhook(c *gin.Context) {
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body"})
		return
	}

	log.Printf("[Kashier Webhook] Received payload: %s", string(bodyBytes))

	var payload struct {
		Event  string `json:"event"`
		Status string `json:"status"`
		Data   struct {
			Status      string `json:"status"`
			Order       string `json:"order"`
			Amount      string `json:"amount"`
			Currency    string `json:"currency"`
			Signature   string `json:"signature"`
			CustomerRef string `json:"customerReference"`
			Customer    struct {
				Email     string `json:"email"`
				Reference string `json:"reference"`
			} `json:"customer"`
		} `json:"data"`
		// Direct payload format fallback
		Order       string `json:"order"`
		PaymentStat string `json:"paymentStatus"`
		Customer    struct {
			Email string `json:"email"`
		} `json:"customer"`
	}

	_ = json.Unmarshal(bodyBytes, &payload)

	orderID := payload.Data.Order
	if orderID == "" {
		orderID = payload.Order
	}

	status := strings.ToUpper(payload.Data.Status)
	if status == "" {
		status = strings.ToUpper(payload.PaymentStat)
	}
	if status == "" {
		status = strings.ToUpper(payload.Status)
	}

	email := payload.Data.Customer.Email
	if email == "" {
		email = payload.Customer.Email
	}
	if email == "" {
		email = payload.Data.CustomerRef
	}

	log.Printf("[Kashier Webhook] Parsed: Order=%s, Status=%s, Email=%s", orderID, status, email)

	// Check if payment was successful (CAPTURED, SUCCESS, PAID)
	isSuccess := status == "SUCCESS" || status == "CAPTURED" || status == "PAID" || strings.Contains(status, "SUCCESS")

	if isSuccess && orderID != "" {
		// Extract plan number from order reference (e.g. XPH-SUB-username-P3-timestamp)
		plan := 3
		parts := strings.Split(orderID, "-")
		for _, part := range parts {
			if strings.HasPrefix(part, "P") && len(part) >= 2 {
				if val, err := strconv.Atoi(part[1:]); err == nil && val > 0 {
					plan = val
					break
				}
			}
		}

		if email != "" {
			_, updateErr := s.router.Pool().Exec(
				c.Request.Context(),
				`UPDATE public.users 
				 SET subscription_plan = $1, 
				     is_subscription_active = true, 
				     subscription_expires_at = NOW() + INTERVAL '30 days',
				     updated_at = NOW()
				 WHERE LOWER(email) = LOWER($2)`,
				plan, email,
			)
			if updateErr != nil {
				log.Printf("[Kashier Webhook] DB Update error: %v", updateErr)
			} else {
				log.Printf("[Kashier Webhook] Successfully activated Plan %d for %s", plan, email)
			}

			// Also persist to public.subscriptions for web-admin billing review immediately
			price := getPlanPrice(plan)
			subQuery := `
				INSERT INTO public.subscriptions (
					tenant_id, user_email, user_name, user_phone, plan_type, amount, payment_method,
					status, order_id, transaction_id, receipt_ref, notes,
					start_date, end_date, created_at, updated_at
				) VALUES (
					(SELECT id FROM public.tenants LIMIT 1),
					$1, 
					COALESCE((SELECT name FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1), 'مشترك Google'),
					COALESCE((SELECT device_name FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1), '-'),
					$2, $3, 'kashier', 'active', $4, $4, $4, 
					'دفع إلكتروني ناجح عبر بوابة كاشير (Kashier Webhook)',
					CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', NOW(), NOW()
				)
			`
			_, subErr := s.router.Pool().Exec(c.Request.Context(), subQuery, email, fmt.Sprintf("%d صيدليات", plan), price, orderID)
			if subErr != nil {
				log.Printf("[Kashier Webhook] Subscriptions insert error: %v", subErr)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "received"})
}

// Redirect page shown when Kashier returns after browser checkout
func (s *SubscriptionService) HandleRedirect(c *gin.Context) {
	html := `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تمت عملية الدفع بنجاح - XPharma</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0F172A, #1E1B4B);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 24px;
      padding: 32px 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    .icon-ring {
      width: 80px;
      height: 80px;
      border-radius: 40px;
      background: rgba(16, 185, 129, 0.2);
      border: 2px solid #10B981;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px auto;
      font-size: 38px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 10px 0;
      color: #34D399;
    }
    p {
      color: #E2E8F0;
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .btn {
      display: block;
      background: linear-gradient(135deg, #10B981, #059669);
      color: white;
      text-decoration: none;
      padding: 14px 20px;
      border-radius: 14px;
      font-weight: bold;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-ring">✓</div>
    <h1>تمت العملية بنجاح!</h1>
    <p>تم استلام طلبك وجاري تفعيل باقة الاشتراك الخاصة بك في تطبيق XPharma فوراً.</p>
    <a href="xpharma://subscription-success" class="btn">العودة للتطبيق</a>
  </div>
</body>
</html>`
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, html)
}

// VerifySignature Helper for Kashier HMAC-SHA256
func VerifyKashierSignature(queryString, signature, apiKey string) bool {
	h := hmac.New(sha256.New, []byte(apiKey))
	h.Write([]byte(queryString))
	expected := hex.EncodeToString(h.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
