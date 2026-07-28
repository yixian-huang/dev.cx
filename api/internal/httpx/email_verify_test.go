package httpx_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func testSha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func TestEmailVerification(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()

	codes, _ := invite.Mint(ctx, pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"ev@dev.cx","password":"pw123456","handle":"evuser","display_name":"U"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	ck := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", ck)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	// 注册即持有待验证 token(hash 非空、未验证)
	var hash *string
	var verified *string
	pool.QueryRow(ctx,
		`select email_verify_token_hash, email_verified_at::text from users where handle='evuser'`).
		Scan(&hash, &verified)
	if hash == nil || verified != nil {
		t.Fatalf("after register: hash=%v verified=%v", hash, verified)
	}

	// 软门:未验证不可发帖,/api/me 报 email_verified:false
	if rec := send("POST", "/api/posts",
		`{"type":"discuss","title":"t","body_md":"b"}`); rec.Code != 403 ||
		!strings.Contains(rec.Body.String(), "email_unverified") {
		t.Errorf("unverified post → %d %s, want 403 email_unverified", rec.Code, rec.Body)
	}
	if rec := send("GET", "/api/me", ""); !strings.Contains(rec.Body.String(), `"email_verified":false`) {
		t.Errorf("me missing email_verified:false: %s", rec.Body)
	}

	// 过期 token 拒绝
	pool.Exec(ctx,
		`update users set email_verify_token_hash=$1, email_verify_sent_at=now()-interval '25 hours' where handle='evuser'`,
		testSha256Hex("expiredtok"))
	if rec := send("POST", "/api/auth/verify-email", `{"token":"expiredtok"}`); rec.Code != 400 {
		t.Errorf("expired token → %d, want 400", rec.Code)
	}

	// 有效 token 验证成功且一次性
	pool.Exec(ctx,
		`update users set email_verify_token_hash=$1, email_verify_sent_at=now() where handle='evuser'`,
		testSha256Hex("goodtok12345"))
	if rec := send("POST", "/api/auth/verify-email", `{"token":"goodtok12345"}`); rec.Code != 204 {
		t.Fatalf("verify → %d %s", rec.Code, rec.Body)
	}
	pool.QueryRow(ctx, `select email_verified_at::text from users where handle='evuser'`).Scan(&verified)
	if verified == nil {
		t.Error("email_verified_at not set")
	}
	if rec := send("POST", "/api/auth/verify-email", `{"token":"goodtok12345"}`); rec.Code != 400 {
		t.Errorf("token reuse → %d, want 400", rec.Code)
	}
	if rec := send("POST", "/api/posts",
		`{"type":"discuss","title":"verified post","body_md":"b"}`); rec.Code != 201 {
		t.Errorf("verified post → %d %s", rec.Code, rec.Body)
	}

	// 已验证再 resend → 400
	if rec := send("POST", "/api/me/resend-verification", ""); rec.Code != 400 {
		t.Errorf("resend verified → %d, want 400", rec.Code)
	}

	// 未验证 resend:204 后立即再发 → 429 冷却
	pool.Exec(ctx,
		`update users set email_verified_at=null, email_verify_sent_at=null where handle='evuser'`)
	if rec := send("POST", "/api/me/resend-verification", ""); rec.Code != 204 {
		t.Fatalf("resend → %d %s", rec.Code, rec.Body)
	}
	if rec := send("POST", "/api/me/resend-verification", ""); rec.Code != 429 {
		t.Errorf("resend cooldown → %d, want 429", rec.Code)
	}

	// 匿名 verify-email 可用(无需登录);resend 需登录
	anon := httptest.NewRequest("POST", "/api/me/resend-verification", strings.NewReader(""))
	arec := httptest.NewRecorder()
	srv.ServeHTTP(arec, anon)
	if arec.Code != 401 {
		t.Errorf("anon resend → %d, want 401", arec.Code)
	}
}
