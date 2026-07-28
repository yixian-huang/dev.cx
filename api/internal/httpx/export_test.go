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

func TestExport(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()
	codes, _ := invite.Mint(ctx, pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"ex@dev.cx","password":"pw123456","handle":"exporter","display_name":"U"}`)
	pool.Exec(ctx, `update users set email_verified_at=now() where handle='exporter'`)
	ck := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", ck)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	if rec := send("POST", "/api/projects",
		`{"slug":"exp-proj","name":"Exp","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("project → %d %s", rec.Code, rec.Body)
	}
	if rec := send("POST", "/api/posts",
		`{"type":"discuss","title":"my exported post","body_md":"exported body"}`); rec.Code != 201 {
		t.Fatalf("post → %d %s", rec.Code, rec.Body)
	}

	rec := send("GET", "/api/me/export", "")
	if rec.Code != 200 {
		t.Fatalf("export → %d %s", rec.Code, rec.Body)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "attachment") {
		t.Errorf("Content-Disposition = %q", cd)
	}
	body := rec.Body.String()
	for _, want := range []string{"devcx-export-v1", "exporter", "exp-proj", "my exported post", "exported body"} {
		if !strings.Contains(body, want) {
			t.Errorf("export missing %q", want)
		}
	}

	// 未登录 401
	anon := httptest.NewRequest("GET", "/api/me/export", nil)
	arec := httptest.NewRecorder()
	srv.ServeHTTP(arec, anon)
	if arec.Code != 401 {
		t.Errorf("anon export → %d, want 401", arec.Code)
	}
}
