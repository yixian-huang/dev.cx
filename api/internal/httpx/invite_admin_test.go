package httpx_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestAdminInvites(t *testing.T) {
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

	adminCk := mkUser("invop", "invop@dev.cx")
	userCk := mkUser("nobody", "nobody@dev.cx")
	pool.Exec(ctx, `update users set role='admin' where handle='invop'`)

	// 非 admin 403
	if rec := send(userCk, "GET", "/api/admin/invites", ""); rec.Code != 403 {
		t.Errorf("non-admin invites → %d", rec.Code)
	}

	// 造码
	mrec := send(adminCk, "POST", "/api/admin/invites", `{"n":2,"uses":3,"note":"w32-batch"}`)
	if mrec.Code != 201 {
		t.Fatalf("mint → %d %s", mrec.Code, mrec.Body)
	}
	var minted struct {
		Codes []string `json:"codes"`
	}
	if err := json.Unmarshal(mrec.Body.Bytes(), &minted); err != nil || len(minted.Codes) != 2 {
		t.Fatalf("mint payload: %v %s", err, mrec.Body)
	}

	// 列表含 note 与 active
	lrec := send(adminCk, "GET", "/api/admin/invites", "")
	if lrec.Code != 200 || !strings.Contains(lrec.Body.String(), "w32-batch") ||
		!strings.Contains(lrec.Body.String(), `"active":true`) {
		t.Errorf("list → %d %s", lrec.Code, lrec.Body)
	}

	// 作废 → 注册用该码失败
	if rec := send(adminCk, "DELETE", "/api/admin/invites/"+minted.Codes[0], ""); rec.Code != 204 {
		t.Fatalf("void → %d", rec.Code)
	}
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+minted.Codes[0]+`","email":"x@dev.cx","password":"pw123456","handle":"xx1","display_name":"U"}`)
	if reg.Code != 400 || !strings.Contains(reg.Body.String(), "invite_invalid") {
		t.Errorf("register with voided code → %d %s", reg.Code, reg.Body)
	}
	// 重复作废 → 404
	if rec := send(adminCk, "DELETE", "/api/admin/invites/"+minted.Codes[0], ""); rec.Code != 404 {
		t.Errorf("double void → %d, want 404", rec.Code)
	}

	// 参数越界
	if rec := send(adminCk, "POST", "/api/admin/invites", `{"n":51}`); rec.Code != 400 {
		t.Errorf("n=51 → %d, want 400", rec.Code)
	}
}
