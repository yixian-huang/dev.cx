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

func TestAdminModeration(t *testing.T) {
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
	userCk := mkUser("victim", "victim@dev.cx")
	if _, err := pool.Exec(ctx, `update users set role='admin' where handle='op'`); err != nil {
		t.Fatal(err)
	}

	// victim 发一帖
	if rec := send(userCk, "POST", "/api/posts",
		`{"type":"discuss","title":"bad post","body_md":"x"}`); rec.Code != 201 {
		t.Fatalf("create post → %d %s", rec.Code, rec.Body)
	}
	var slug string
	pool.QueryRow(ctx, `select slug from posts where title='bad post'`).Scan(&slug)

	// 非 admin 全线 403
	for _, c := range [][2]string{
		{"POST", "/api/admin/posts/" + slug + "/hide"},
		{"DELETE", "/api/admin/posts/" + slug + "/hide"},
		{"GET", "/api/admin/users/op"},
		{"POST", "/api/admin/users/op/warn"},
		{"POST", "/api/admin/users/op/mute"},
		{"POST", "/api/admin/users/op/suspend"},
		{"GET", "/api/admin/actions"},
	} {
		if rec := send(userCk, c[0], c[1], `{"reason":"r","message":"m"}`); rec.Code != 403 {
			t.Errorf("%s %s as non-admin → %d, want 403", c[0], c[1], rec.Code)
		}
	}
	// 未登录 401
	if rec := send("", "GET", "/api/admin/actions", ""); rec.Code != 401 {
		t.Errorf("anon admin actions → %d, want 401", rec.Code)
	}

	// hide:空 reason 拒绝;正常 204
	if rec := send(adminCk, "POST", "/api/admin/posts/"+slug+"/hide", `{"reason":""}`); rec.Code != 400 {
		t.Errorf("hide empty reason → %d, want 400", rec.Code)
	}
	if rec := send(adminCk, "POST", "/api/admin/posts/"+slug+"/hide", `{"reason":"红线"}`); rec.Code != 204 {
		t.Fatalf("hide → %d %s", rec.Code, rec.Body)
	}
	// unhide 204
	if rec := send(adminCk, "DELETE", "/api/admin/posts/"+slug+"/hide", ""); rec.Code != 204 {
		t.Fatalf("unhide → %d %s", rec.Code, rec.Body)
	}
	// 不存在 404
	if rec := send(adminCk, "POST", "/api/admin/posts/nope/hide", `{"reason":"r"}`); rec.Code != 404 {
		t.Errorf("hide missing → %d, want 404", rec.Code)
	}

	// warn → victim 有 moderation 通知
	if rec := send(adminCk, "POST", "/api/admin/users/victim/warn",
		`{"message":"请注意言辞"}`); rec.Code != 204 {
		t.Fatalf("warn → %d %s", rec.Code, rec.Body)
	}
	if rec := send(userCk, "GET", "/api/notifications", ""); !strings.Contains(rec.Body.String(), `"moderation"`) {
		t.Errorf("victim notifications missing moderation: %s", rec.Body)
	}

	// mute 默认 7d → admin user 视图可见 muted_until
	if rec := send(adminCk, "POST", "/api/admin/users/victim/mute", `{"reason":"灌水"}`); rec.Code != 204 {
		t.Fatalf("mute → %d %s", rec.Code, rec.Body)
	}
	if rec := send(adminCk, "GET", "/api/admin/users/victim", ""); !strings.Contains(rec.Body.String(), "muted_until") {
		t.Errorf("admin user view missing muted_until: %s", rec.Body)
	}
	if rec := send(adminCk, "DELETE", "/api/admin/users/victim/mute", ""); rec.Code != 204 {
		t.Fatalf("unmute → %d", rec.Code)
	}

	// suspend → victim session 失效
	if rec := send(adminCk, "POST", "/api/admin/users/victim/suspend", `{"reason":"严重违规"}`); rec.Code != 204 {
		t.Fatalf("suspend → %d %s", rec.Code, rec.Body)
	}
	if rec := send(userCk, "GET", "/api/me", ""); rec.Code != 401 {
		t.Errorf("suspended session /api/me → %d, want 401", rec.Code)
	}
	if rec := send(adminCk, "DELETE", "/api/admin/users/victim/suspend", ""); rec.Code != 204 {
		t.Fatalf("unsuspend → %d", rec.Code)
	}

	// 审计流水包含上述动作
	rec := send(adminCk, "GET", "/api/admin/actions", "")
	if rec.Code != 200 {
		t.Fatalf("actions → %d %s", rec.Code, rec.Body)
	}
	for _, want := range []string{"hide_post", "unhide_post", "warn", "mute", "unmute", "suspend", "unsuspend"} {
		if !strings.Contains(rec.Body.String(), `"`+want+`"`) {
			t.Errorf("actions missing %s: %s", want, rec.Body)
		}
	}

	// /api/me 带 role
	if rec := send(adminCk, "GET", "/api/me", ""); !strings.Contains(rec.Body.String(), `"role":"admin"`) {
		t.Errorf("me missing role: %s", rec.Body)
	}
}
