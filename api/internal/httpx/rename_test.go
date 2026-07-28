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

func TestRenameAndResolve(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"r@dev.cx","password":"pw123456","handle":"oldhandle","display_name":"R"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	if rec := do("POST", "/api/me/handle", `{"handle":"newhandle"}`); rec.Code != 200 {
		t.Fatalf("rename → %d %s", rec.Code, rec.Body)
	}
	// 90 天内二次改名被拒
	if rec := do("POST", "/api/me/handle", `{"handle":"thirdname"}`); rec.Code != 429 {
		t.Fatalf("second rename → %d, want 429", rec.Code)
	}
	// 旧 handle 解析出 moved_to
	rec := do("GET", "/api/resolve/oldhandle", "")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"moved_to":"newhandle"`) {
		t.Fatalf("resolve old → %d %s", rec.Code, rec.Body)
	}
	// 新 handle 正常解析
	rec = do("GET", "/api/resolve/newhandle", "")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"handle":"newhandle"`) {
		t.Fatalf("resolve new → %d %s", rec.Code, rec.Body)
	}
	// 旧 handle 不可被注册（Available 已含 history，此处走注册全流程验证）
	codes2, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	rr := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes2[0]+`","email":"z@dev.cx","password":"pw123456","handle":"oldhandle","display_name":"Z"}`)
	if rr.Code != 400 || !strings.Contains(rr.Body.String(), "handle_taken") {
		t.Fatalf("register old handle → %d %s", rr.Code, rr.Body)
	}
	// 未知 handle 404
	if rec := do("GET", "/api/resolve/nobody", ""); rec.Code != 404 {
		t.Fatalf("resolve unknown → %d", rec.Code)
	}
}
