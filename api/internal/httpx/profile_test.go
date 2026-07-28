package httpx_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestProfileEditAndPublicView(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"p@dev.cx","password":"pw123456","handle":"profiler","display_name":"P"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	rec := do("PATCH", "/api/me", `{"bio":"building tools","status":"paused","weekly_status":"移植 Raft 到 WASM"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"paused"`) {
		t.Fatalf("patch → %d %s", rec.Code, rec.Body)
	}
	if rec := do("PATCH", "/api/me", `{"status":"invalid-state"}`); rec.Code != 400 {
		t.Fatalf("bad status → %d", rec.Code)
	}

	rec = do("PUT", "/api/me/links",
		`[{"kind":"github","url":"https://github.com/profiler"},{"kind":"website","url":"https://yx.ink"}]`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "yx.ink") {
		t.Fatalf("links → %d %s", rec.Code, rec.Body)
	}
	if rec := do("PUT", "/api/me/links", `[{"kind":"github","url":"javascript:alert(1)"}]`); rec.Code != 400 {
		t.Fatalf("bad url → %d", rec.Code)
	}

	// 公开视图：匿名可读、不含 email
	req := httptest.NewRequest(http.MethodGet, "/api/users/profiler", nil)
	prec := httptest.NewRecorder()
	srv.ServeHTTP(prec, req)
	if prec.Code != 200 || strings.Contains(prec.Body.String(), "p@dev.cx") {
		t.Fatalf("public view → %d %s", prec.Code, prec.Body)
	}
}

func TestPartialProfileUpdate(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"partial@dev.cx","password":"pw123456","handle":"partialuser","display_name":"Partial"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	// Step 1: Update all fields
	rec := do("PATCH", "/api/me",
		`{"display_name":"Full Name","bio":"Full Bio","status":"building","avatar_url":"https://example.com/avatar.jpg"}`)
	if rec.Code != 200 {
		t.Fatalf("full update failed → %d %s", rec.Code, rec.Body)
	}

	// Step 2: Update only bio
	rec = do("PATCH", "/api/me", `{"bio":"Only Bio Updated"}`)
	if rec.Code != 200 {
		t.Fatalf("partial update failed → %d %s", rec.Code, rec.Body)
	}

	// Step 3: Get public profile and verify all fields preserved
	req := httptest.NewRequest("GET", "/api/users/partialuser", nil)
	prec := httptest.NewRecorder()
	srv.ServeHTTP(prec, req)
	body := prec.Body.String()
	if prec.Code != 200 {
		t.Fatalf("get user → %d %s", prec.Code, body)
	}
	// Verify display_name unchanged
	if !strings.Contains(body, `"display_name":"Full Name"`) {
		t.Fatalf("display_name was cleared by partial update: %s", body)
	}
	// Verify status unchanged
	if !strings.Contains(body, `"status":"building"`) {
		t.Fatalf("status was cleared by partial update: %s", body)
	}
	// Verify avatar_url unchanged
	if !strings.Contains(body, `"avatar_url":"https://example.com/avatar.jpg"`) {
		t.Fatalf("avatar_url was cleared by partial update: %s", body)
	}
	// Verify bio was updated
	if !strings.Contains(body, `"bio":"Only Bio Updated"`) {
		t.Fatalf("bio was not updated: %s", body)
	}
}

// TestAvatarURLSchemeValidation 覆盖 avatar_url 的 scheme 白名单：PUT /me/links 早就有
// http/https/mailto 前缀校验，但 PATCH /me 的 avatar_url 曾经完全不校验，javascript:/data:
// 之类的值可以直接入库，再经公开档案接口原样吐回给任何访问者的浏览器（存储型 XSS）。
// 空串必须放行，表示清空头像。
func TestAvatarURLSchemeValidation(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"avatar@dev.cx","password":"pw123456","handle":"avataruser","display_name":"A"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	do := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("PATCH", "/api/me", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	if rec := do(`{"avatar_url":"javascript:alert(1)"}`); rec.Code != 400 || !strings.Contains(rec.Body.String(), "bad_avatar_url") {
		t.Fatalf("javascript: avatar_url → %d %s, want 400 bad_avatar_url", rec.Code, rec.Body)
	}
	if rec := do(`{"avatar_url":"data:text/html,<script>alert(1)</script>"}`); rec.Code != 400 || !strings.Contains(rec.Body.String(), "bad_avatar_url") {
		t.Fatalf("data: avatar_url → %d %s, want 400 bad_avatar_url", rec.Code, rec.Body)
	}
	if rec := do(`{"avatar_url":"https://example.com/me.png"}`); rec.Code != 200 {
		t.Fatalf("https avatar_url → %d %s, want 200", rec.Code, rec.Body)
	}
	rec := do(`{"avatar_url":""}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"avatar_url":""`) {
		t.Fatalf("empty avatar_url should clear it → %d %s", rec.Code, rec.Body)
	}
}

// TestProfileFieldLengthLimits 覆盖用户可控文本字段的字符数上限：display_name ≤ 64、
// bio ≤ 2000、weekly_status ≤ 280、avatar_url ≤ 512、link url ≤ 512。超限拒绝，
// 恰好等于上限放行——off-by-one 是这类校验最常见的 bug 来源。
func TestProfileFieldLengthLimits(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"lenlimit@dev.cx","password":"pw123456","handle":"lenlimituser","display_name":"L"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	patch := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("PATCH", "/api/me", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	putLinks := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("PUT", "/api/me/links", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	jsonStr := func(field string, n int) string {
		return `{"` + field + `":"` + strings.Repeat("a", n) + `"}`
	}
	urlOfLen := func(n int) string {
		// "https://" 占 8 字符，剩余用 'a' 填满到目标长度。
		return "https://" + strings.Repeat("a", n-8)
	}

	cases := []struct {
		name     string
		body     string
		wantCode int
	}{
		{"display_name over limit", jsonStr("display_name", 65), 400},
		{"display_name at limit", jsonStr("display_name", 64), 200},
		{"bio over limit", jsonStr("bio", 2001), 400},
		{"bio at limit", jsonStr("bio", 2000), 200},
		{"weekly_status over limit", jsonStr("weekly_status", 281), 400},
		{"weekly_status at limit", jsonStr("weekly_status", 280), 200},
		{"avatar_url over limit", `{"avatar_url":"` + urlOfLen(513) + `"}`, 400},
		{"avatar_url at limit", `{"avatar_url":"` + urlOfLen(512) + `"}`, 200},
	}
	for _, c := range cases {
		rec := patch(c.body)
		if rec.Code != c.wantCode {
			t.Errorf("%s → %d %s, want %d", c.name, rec.Code, rec.Body, c.wantCode)
		}
	}

	if rec := putLinks(`[{"kind":"website","url":"` + urlOfLen(513) + `"}]`); rec.Code != 400 {
		t.Errorf("link url over limit → %d %s, want 400", rec.Code, rec.Body)
	}
	if rec := putLinks(`[{"kind":"website","url":"` + urlOfLen(512) + `"}]`); rec.Code != 200 {
		t.Errorf("link url at limit → %d %s, want 200", rec.Code, rec.Body)
	}
}

func TestPatchMeEmailWeekly(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"wk@dev.cx","password":"pw123456","handle":"weeklyuser","display_name":"W"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	// 默认开
	if rec := do("GET", "/api/me", ""); !strings.Contains(rec.Body.String(), `"email_weekly":true`) {
		t.Fatalf("default → %d %s", rec.Code, rec.Body)
	}
	if rec := do("PATCH", "/api/me", `{"email_weekly":false}`); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), `"email_weekly":false`) {
		t.Fatalf("patch off → %d %s", rec.Code, rec.Body)
	}
	if rec := do("GET", "/api/me", ""); !strings.Contains(rec.Body.String(), `"email_weekly":false`) {
		t.Fatalf("me after off → %d %s", rec.Code, rec.Body)
	}
	if rec := do("PATCH", "/api/me", `{"email_weekly":true}`); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), `"email_weekly":true`) {
		t.Fatalf("patch on → %d %s", rec.Code, rec.Body)
	}
}
