package httpx_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestPasswordReset(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()

	codes, _ := invite.Mint(ctx, pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"pr@dev.cx","password":"oldpw123456","handle":"pruser","display_name":"U"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	oldCookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	// forgot:存在与不存在的邮箱都恒 204
	if rec := postJSON(t, srv, "/api/auth/forgot-password", `{"email":"pr@dev.cx"}`); rec.Code != 204 {
		t.Fatalf("forgot known → %d %s", rec.Code, rec.Body)
	}
	if rec := postJSON(t, srv, "/api/auth/forgot-password", `{"email":"ghost@dev.cx"}`); rec.Code != 204 {
		t.Errorf("forgot unknown → %d, want 204", rec.Code)
	}
	var hash *string
	pool.QueryRow(ctx, `select password_reset_token_hash from users where handle='pruser'`).Scan(&hash)
	if hash == nil {
		t.Fatal("reset token not issued")
	}

	// 冷却期内重复请求仍 204,token 不变(防枚举 + 防刷)
	if rec := postJSON(t, srv, "/api/auth/forgot-password", `{"email":"pr@dev.cx"}`); rec.Code != 204 {
		t.Errorf("forgot cooldown → %d, want 204", rec.Code)
	}
	var hash2 *string
	pool.QueryRow(ctx, `select password_reset_token_hash from users where handle='pruser'`).Scan(&hash2)
	if hash2 == nil || *hash2 != *hash {
		t.Errorf("cooldown should keep token unchanged")
	}

	// 过期 token 拒绝
	pool.Exec(ctx,
		`update users set password_reset_token_hash=$1, password_reset_sent_at=now()-interval '2 hours' where handle='pruser'`,
		testSha256Hex("expiredreset"))
	if rec := postJSON(t, srv, "/api/auth/reset-password",
		`{"token":"expiredreset","password":"newpw123456"}`); rec.Code != 400 {
		t.Errorf("expired reset → %d, want 400", rec.Code)
	}

	// 弱密码拒绝
	pool.Exec(ctx,
		`update users set password_reset_token_hash=$1, password_reset_sent_at=now() where handle='pruser'`,
		testSha256Hex("goodreset123"))
	if rec := postJSON(t, srv, "/api/auth/reset-password",
		`{"token":"goodreset123","password":"short"}`); rec.Code != 400 {
		t.Errorf("weak password → %d, want 400", rec.Code)
	}

	// 有效重置:204,旧 session 失效,旧密码不可登录,新密码可登录,token 一次性
	if rec := postJSON(t, srv, "/api/auth/reset-password",
		`{"token":"goodreset123","password":"newpw123456"}`); rec.Code != 204 {
		t.Fatalf("reset → %d %s", rec.Code, rec.Body)
	}
	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Cookie", oldCookie)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Errorf("old session after reset → %d, want 401", rec.Code)
	}
	if lrec := postJSON(t, srv, "/api/auth/login", `{"email":"pr@dev.cx","password":"oldpw123456"}`); lrec.Code != 401 {
		t.Errorf("old password login → %d, want 401", lrec.Code)
	}
	if lrec := postJSON(t, srv, "/api/auth/login", `{"email":"pr@dev.cx","password":"newpw123456"}`); lrec.Code != 200 {
		t.Errorf("new password login → %d", lrec.Code)
	}
	if rec := postJSON(t, srv, "/api/auth/reset-password",
		`{"token":"goodreset123","password":"another123456"}`); rec.Code != 400 {
		t.Errorf("token reuse → %d, want 400", rec.Code)
	}
}
