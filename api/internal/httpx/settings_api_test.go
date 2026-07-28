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

func TestAdminSettings(t *testing.T) {
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

	adminCk := mkUser("setop", "setop@dev.cx")
	userCk := mkUser("pleb", "pleb@dev.cx")
	pool.Exec(ctx, `update users set role='admin' where handle='setop'`)

	// 非 admin 403
	if rec := send(userCk, "GET", "/api/admin/settings", ""); rec.Code != 403 {
		t.Errorf("non-admin settings → %d", rec.Code)
	}

	// 白名单外 key 400
	if rec := send(adminCk, "PUT", "/api/admin/settings/evil_key", `{"value":"x"}`); rec.Code != 400 {
		t.Errorf("unknown key → %d, want 400", rec.Code)
	}

	// 写非 secret 键 → 列表回显 value 且 source=db
	if rec := send(adminCk, "PUT", "/api/admin/settings/smtp_host", `{"value":"mail.dev.cx"}`); rec.Code != 204 {
		t.Fatalf("put smtp_host → %d %s", rec.Code, rec.Body)
	}
	// 写 secret 键 → 列表 configured 但绝不回显值
	if rec := send(adminCk, "PUT", "/api/admin/settings/smtp_password", `{"value":"hunter2"}`); rec.Code != 204 {
		t.Fatalf("put smtp_password → %d", rec.Code)
	}
	lrec := send(adminCk, "GET", "/api/admin/settings", "")
	if lrec.Code != 200 {
		t.Fatalf("list → %d %s", lrec.Code, lrec.Body)
	}
	body := lrec.Body.String()
	if !strings.Contains(body, "mail.dev.cx") {
		t.Errorf("non-secret value not echoed: %s", body)
	}
	if strings.Contains(body, "hunter2") {
		t.Errorf("SECRET VALUE LEAKED: %s", body)
	}
	if !strings.Contains(body, `"key":"smtp_password"`) {
		t.Errorf("secret key row missing: %s", body)
	}

	// DELETE 回退
	if rec := send(adminCk, "DELETE", "/api/admin/settings/smtp_host", ""); rec.Code != 204 {
		t.Fatalf("delete → %d", rec.Code)
	}

	// smtp-test 未配全 → 400 smtp_unconfigured(smtp_host 刚删掉)
	if rec := send(adminCk, "POST", "/api/admin/settings/smtp-test", ""); rec.Code != 400 {
		t.Errorf("smtp-test unconfigured → %d, want 400", rec.Code)
	}

	// GitHub OAuth 动态配置:写入 client_id 后,/api/auth/github 的跳转 URL 用 DB 值
	if rec := send(adminCk, "PUT", "/api/admin/settings/github_client_id",
		`{"value":"dbclient123"}`); rec.Code != 204 {
		t.Fatalf("put client_id → %d", rec.Code)
	}
	grec := send("", "GET", "/api/auth/github", "")
	if grec.Code != 302 || !strings.Contains(grec.Header().Get("Location"), "dbclient123") {
		t.Errorf("oauth start should use db client_id: %d %s", grec.Code, grec.Header().Get("Location"))
	}
}
