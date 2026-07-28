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

func TestWaitlist(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()

	// 提交 → 204;重复提交 → 仍 204 且不重复入库
	for i := 0; i < 2; i++ {
		if rec := postJSON(t, srv, "/api/waitlist", `{"email":"queue@dev.cx"}`); rec.Code != 204 {
			t.Fatalf("waitlist submit #%d → %d %s", i, rec.Code, rec.Body)
		}
	}
	var n int
	pool.QueryRow(ctx, `select count(*) from waitlist`).Scan(&n)
	if n != 1 {
		t.Errorf("waitlist rows = %d, want 1", n)
	}
	// 非法输入
	if rec := postJSON(t, srv, "/api/waitlist", `{"email":"not-an-email"}`); rec.Code != 400 {
		t.Errorf("bad email → %d, want 400", rec.Code)
	}

	// admin 列表:非 admin 403,admin 可见
	codes, _ := invite.Mint(ctx, pool, 2, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"wl@dev.cx","password":"pw123456","handle":"wladmin","display_name":"U"}`)
	adminCk := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	reg2 := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[1]+`","email":"wl2@dev.cx","password":"pw123456","handle":"wluser","display_name":"U"}`)
	userCk := strings.Split(reg2.Header().Get("Set-Cookie"), ";")[0]
	pool.Exec(ctx, `update users set role='admin' where handle='wladmin'`)

	send := func(ck, method, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("Cookie", ck)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	if rec := send(userCk, "GET", "/api/admin/waitlist"); rec.Code != 403 {
		t.Errorf("non-admin waitlist → %d", rec.Code)
	}
	rec := send(adminCk, "GET", "/api/admin/waitlist")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "queue@dev.cx") ||
		!strings.Contains(rec.Body.String(), `"count":1`) {
		t.Errorf("admin waitlist → %d %s", rec.Code, rec.Body)
	}
}
