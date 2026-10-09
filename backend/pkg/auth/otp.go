package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"xpharma-backend/pkg/resilience"
)

type OTPService struct {
	apiKey  string
	baseURL string
	client  *http.Client
	breaker *resilience.CircuitBreaker
}

// NewOTPService initializes Authentica SA client with resilience
func NewOTPService() *OTPService {
	apiKey := os.Getenv("AUTHENTICA_API_KEY")
	if apiKey == "" {
		apiKey = "$2y$10$vTNxXEQ1C1qD8gkFxLkO..gN.s94gsYsu8MFbaW3j37h4aujyTTFq"
	}
	baseURL := os.Getenv("AUTHENTICA_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.authentica.sa"
	}
	return &OTPService{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		breaker: resilience.NewCircuitBreaker("authentica-otp", 3, 20*time.Second),
	}
}

// NormalizePhone formats phone numbers into international E.164 (+966..., +20...)
func NormalizePhone(phone string) string {
	cleaned := strings.TrimSpace(phone)
	cleaned = strings.ReplaceAll(cleaned, " ", "")
	cleaned = strings.ReplaceAll(cleaned, "-", "")
	cleaned = strings.ReplaceAll(cleaned, "(", "")
	cleaned = strings.ReplaceAll(cleaned, ")", "")

	if strings.HasPrefix(cleaned, "+") {
		return cleaned
	}
	if strings.HasPrefix(cleaned, "00") {
		return "+" + cleaned[2:]
	}
	// Saudi local format 05xxxxxxxx -> +9665xxxxxxxx
	if strings.HasPrefix(cleaned, "05") && len(cleaned) == 10 {
		return "+966" + cleaned[1:]
	}
	// Saudi local without 0: 5xxxxxxxx -> +9665xxxxxxxx
	if strings.HasPrefix(cleaned, "5") && len(cleaned) == 9 {
		return "+966" + cleaned
	}
	// Egyptian local format 01xxxxxxxxx -> +201xxxxxxxxx
	if strings.HasPrefix(cleaned, "01") && len(cleaned) == 11 {
		return "+20" + cleaned[1:]
	}
	return "+" + cleaned
}

type AuthenticaSendReq struct {
	Method string `json:"method"`
	Phone  string `json:"phone"`
}

type AuthenticaVerifyReq struct {
	Phone string `json:"phone"`
	OTP   string `json:"otp"`
}

type AuthenticaResponse struct {
	Success bool            `json:"success"`
	Status  *bool           `json:"status,omitempty"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// SendOTP requests an SMS OTP code for the given phone number via Authentica SA
func (s *OTPService) SendOTP(ctx context.Context, phone string) error {
	normalized := NormalizePhone(phone)
	if len(normalized) < 9 {
		return errors.New("رقم الهاتف غير صالح")
	}

	payload := AuthenticaSendReq{
		Method: "sms",
		Phone:  normalized,
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("فشل تجهيز الطلب: %w", err)
	}

	endpoints := []string{
		s.baseURL + "/api/v2/send-otp",
		s.baseURL + "/api/v1/send-otp",
	}

	var lastErr error
	for _, ep := range endpoints {
		err := s.breaker.Execute(func() error {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep, bytes.NewReader(bodyBytes))
			if err != nil {
				return err
			}
			req.Header.Set("X-Authorization", s.apiKey)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json")

			resp, err := s.client.Do(req)
			if err != nil {
				return fmt.Errorf("فشل الاتصال بمزود الرسائل: %w", err)
			}
			defer resp.Body.Close()

			respBody, _ := io.ReadAll(resp.Body)
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				var authResp AuthenticaResponse
				if err := json.Unmarshal(respBody, &authResp); err == nil && !authResp.Success && (authResp.Status != nil && !*authResp.Status) {
					return fmt.Errorf("فشل الإرسال: %s", authResp.Message)
				}
				log.Printf("[OTP] Sent successfully to %s via %s", normalized, ep)
				return nil
			}

			var errResp AuthenticaResponse
			if err := json.Unmarshal(respBody, &errResp); err == nil && errResp.Message != "" {
				return fmt.Errorf("خطأ مزود الخدمة (%d): %s", resp.StatusCode, errResp.Message)
			}
			return fmt.Errorf("فشل إرسال رمز التحقق (رمز الحالة: %d)", resp.StatusCode)
		}, nil)

		if err == nil {
			return nil
		}
		lastErr = err
	}

	return lastErr
}

// VerifyOTP validates the OTP code against Authentica SA
func (s *OTPService) VerifyOTP(ctx context.Context, phone, otp string) (bool, error) {
	normalized := NormalizePhone(phone)
	cleanOTP := strings.TrimSpace(otp)
	if cleanOTP == "" {
		return false, errors.New("رمز التحقق مطلوب")
	}

	payload := AuthenticaVerifyReq{
		Phone: normalized,
		OTP:   cleanOTP,
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return false, fmt.Errorf("فشل تجهيز طلب التحقق: %w", err)
	}

	endpoints := []string{
		s.baseURL + "/api/v2/verify-otp",
		s.baseURL + "/api/v1/verify-otp",
	}

	var lastErr error
	for _, ep := range endpoints {
		var verified bool
		err := s.breaker.Execute(func() error {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep, bytes.NewReader(bodyBytes))
			if err != nil {
				return err
			}
			req.Header.Set("X-Authorization", s.apiKey)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json")

			resp, err := s.client.Do(req)
			if err != nil {
				return fmt.Errorf("فشل الاتصال بمزود الخدمة: %w", err)
			}
			defer resp.Body.Close()

			respBody, _ := io.ReadAll(resp.Body)

			// 200 Success
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				var authResp AuthenticaResponse
				if err := json.Unmarshal(respBody, &authResp); err == nil {
					if authResp.Success || (authResp.Status != nil && *authResp.Status) {
						verified = true
						return nil
					}
				}
				// 200 with false status
				verified = false
				return nil
			}

			// 422/400 Validation or Incorrect OTP
			if resp.StatusCode == http.StatusUnprocessableEntity || resp.StatusCode == http.StatusBadRequest {
				verified = false
				return nil
			}

			return fmt.Errorf("خطأ من خادم التحقق: %d", resp.StatusCode)
		}, nil)

		if err == nil {
			return verified, nil
		}
		lastErr = err
	}

	return false, lastErr
}
