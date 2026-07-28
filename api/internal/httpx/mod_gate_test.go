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

func TestModerationGates(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()

	mkUser := func(handle, email string) string {
		codes, _ := invite.Mint(ctx, pool, 1, 1, "t")
		reg := postJSON(t, srv, "/api/auth/register",
			`{"invite_code":"`+codes[0]+`","email":"`+email+`","password":"pw123456","handle":"`+handle+`","display_name":"U"}`)
		if reg.Code != 201 {
			t.Fatalf("register %s → %d %s", handle, reg.Code, reg.Body)
		}
		pool.Exec(ctx, `update users set email_verified_at=now() where handle='`+handle+`'`)
		return strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	}
	send := func(cookie, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	adminCk := mkUser("op", "op@dev.cx")
	userCk := mkUser("muted1", "muted1@dev.cx")
	pool.Exec(ctx, `update users set role='admin' where handle='op'`)

	// mute 后:发帖/回复均 403 muted 且带 muted_until
	if rec := send(adminCk, "POST", "/api/admin/users/muted1/mute", `{"reason":"r"}`); rec.Code != 204 {
		t.Fatalf("mute → %d %s", rec.Code, rec.Body)
	}
	rec := send(userCk, "POST", "/api/posts", `{"type":"discuss","title":"t","body_md":"b"}`)
	if rec.Code != 403 || !strings.Contains(rec.Body.String(), "muted_until") {
		t.Errorf("muted create post → %d %s, want 403 with muted_until", rec.Code, rec.Body)
	}
	// 已有帖子供回复测试:用 admin 发
	if rec := send(adminCk, "POST", "/api/posts", `{"type":"discuss","title":"host","body_md":"b"}`); rec.Code != 201 {
		t.Fatalf("admin post → %d %s", rec.Code, rec.Body)
	}
	var slug string
	pool.QueryRow(ctx, `select slug from posts where title='host'`).Scan(&slug)
	if rec := send(userCk, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"x"}`); rec.Code != 403 {
		t.Errorf("muted reply → %d, want 403", rec.Code)
	}
	// muted 仍可读
	if rec := send(userCk, "GET", "/api/posts", ""); rec.Code != 200 {
		t.Errorf("muted list read → %d, want 200", rec.Code)
	}
	// unmute 后恢复
	send(adminCk, "DELETE", "/api/admin/users/muted1/mute", "")
	if rec := send(userCk, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"ok"}`); rec.Code != 201 {
		t.Errorf("unmuted reply → %d %s", rec.Code, rec.Body)
	}

	// suspend 后:密码登录 403 suspended
	if rec := send(adminCk, "POST", "/api/admin/users/muted1/suspend", `{"reason":"r"}`); rec.Code != 204 {
		t.Fatalf("suspend → %d", rec.Code)
	}
	lrec := postJSON(t, srv, "/api/auth/login", `{"email":"muted1@dev.cx","password":"pw123456"}`)
	if lrec.Code != 403 || !strings.Contains(lrec.Body.String(), "suspended") {
		t.Errorf("suspended login → %d %s, want 403 suspended", lrec.Code, lrec.Body)
	}
}
