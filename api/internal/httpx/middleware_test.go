package httpx_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
)

func TestAuthRateLimit(t *testing.T) {
	srv := httpx.NewServer(httpx.Deps{Cfg: config.Load()}) // 无 Pool：login 会 500，但限流在前
	var last int
	for i := 0; i < 12; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = "10.0.0.9:1234"
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("12th auth req → %d, want 429", last)
	}
}

// TestRateLimitForgedXFFDoesNotBypassWithoutTrustedProxy 覆盖反代信任白名单的默认拒绝：
// TrustedProxies 为空（默认配置）时，限流必须只看 TCP 直连对端地址，绝不采信客户端能
// 随意伪造的 X-Forwarded-For；否则任何请求方只要给每次请求换一个假 XFF 值，就能让同一
// 个真实来源无限绕过限流。这里所有请求都来自同一个 RemoteAddr，但各自带不同的伪造
// XFF；如果 XFF 被采信，12 个"不同" key 各自只用 1 个令牌，永远不会 429——那就是回归。
func TestRateLimitForgedXFFDoesNotBypassWithoutTrustedProxy(t *testing.T) {
	srv := httpx.NewServer(httpx.Deps{Cfg: config.Load()}) // TrustedProxies 默认空
	var last int
	for i := 0; i < 12; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = "10.0.0.9:1234"
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("203.0.113.%d", i)) // 每次伪造不同值
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("forged XFF bypassed rate limit; 12th req → %d, want 429", last)
	}
}

// TestRateLimitPerClientBehindTrustedProxy 覆盖可信反代场景：当直连对端地址落在配置的
// 可信 CIDR 内时，才应改用 X-Forwarded-For 里的真实客户端地址作为限流 key。这里 12 个
// 请求都来自同一个（可信）RemoteAddr，但各带不同的真实客户端 XFF；它们应被视为 12 个
// 不同客户端、各自独立计数，没有一个会撞到限流。
func TestRateLimitPerClientBehindTrustedProxy(t *testing.T) {
	cfg := config.Load()
	cfg.TrustedProxies = "10.0.0.0/8"
	srv := httpx.NewServer(httpx.Deps{Cfg: cfg})
	for i := 0; i < 12; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = "10.0.0.9:1234" // 落在可信 CIDR 内的反代地址
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("203.0.113.%d", i))
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			t.Fatalf("client %d (XFF 203.0.113.%d) wrongly rate-limited behind trusted proxy: %d", i, i, rec.Code)
		}
	}
}

func TestSecurityHeaders(t *testing.T) {
	srv := httpx.NewServer(httpx.Deps{Cfg: config.Load()})
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing nosniff")
	}
}
