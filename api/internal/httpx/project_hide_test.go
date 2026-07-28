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

func TestProjectSoftHide(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()
	codes, _ := invite.Mint(ctx, pool, 2, 1, "t")

	regOwner := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"hide-own@dev.cx","password":"pw123456","handle":"hideown","display_name":"H"}`)
	if regOwner.Code != 201 {
		t.Fatalf("reg owner → %d %s", regOwner.Code, regOwner.Body)
	}
	pool.Exec(ctx, `update users set email_verified_at=now() where handle='hideown'`)
	ownerCk := strings.Split(regOwner.Header().Get("Set-Cookie"), ";")[0]

	regVisitor := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[1]+`","email":"hide-vis@dev.cx","password":"pw123456","handle":"hidevis","display_name":"V"}`)
	if regVisitor.Code != 201 {
		t.Fatalf("reg visitor → %d %s", regVisitor.Code, regVisitor.Body)
	}
	pool.Exec(ctx, `update users set email_verified_at=now() where handle='hidevis'`)
	visitorCk := strings.Split(regVisitor.Header().Get("Set-Cookie"), ";")[0]

	send := func(cookie, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	if rec := send(ownerCk, "POST", "/api/projects",
		`{"slug":"soft-hide-p","name":"下架测","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("create → %d %s", rec.Code, rec.Body)
	}

	// 公开列表可见
	if rec := send("", "GET", "/api/projects", ""); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), "soft-hide-p") {
		t.Fatalf("public list should include project: %d %s", rec.Code, rec.Body)
	}

	// 下架
	if rec := send(ownerCk, "POST", "/api/projects/soft-hide-p/hide", ""); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), `"hidden":true`) {
		t.Fatalf("hide → %d %s", rec.Code, rec.Body)
	}

	// 访客详情 404
	if rec := send(visitorCk, "GET", "/api/projects/soft-hide-p", ""); rec.Code != 404 {
		t.Fatalf("visitor get hidden → %d, want 404", rec.Code)
	}
	// 匿名详情 404
	if rec := send("", "GET", "/api/projects/soft-hide-p", ""); rec.Code != 404 {
		t.Fatalf("anon get hidden → %d, want 404", rec.Code)
	}
	// 主人详情仍可读
	if rec := send(ownerCk, "GET", "/api/projects/soft-hide-p", ""); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), `"hidden":true`) {
		t.Fatalf("owner get hidden → %d %s", rec.Code, rec.Body)
	}
	// 公开列表消失
	if rec := send("", "GET", "/api/projects", ""); strings.Contains(rec.Body.String(), "soft-hide-p") {
		t.Fatalf("public list still has hidden project: %s", rec.Body)
	}
	// 主人用户列表仍有;访客用户列表没有
	if rec := send(ownerCk, "GET", "/api/users/hideown/projects", ""); !strings.Contains(rec.Body.String(), "soft-hide-p") {
		t.Fatalf("owner list missing hidden project: %s", rec.Body)
	}
	if rec := send(visitorCk, "GET", "/api/users/hideown/projects", ""); strings.Contains(rec.Body.String(), "soft-hide-p") {
		t.Fatalf("visitor list leaked hidden project: %s", rec.Body)
	}
	// 他人不可 hide
	if rec := send(visitorCk, "POST", "/api/projects/soft-hide-p/hide", ""); rec.Code != 403 {
		t.Fatalf("visitor hide → %d, want 403", rec.Code)
	}

	// 恢复
	if rec := send(ownerCk, "DELETE", "/api/projects/soft-hide-p/hide", ""); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), `"hidden":false`) {
		t.Fatalf("unhide → %d %s", rec.Code, rec.Body)
	}
	if rec := send("", "GET", "/api/projects/soft-hide-p", ""); rec.Code != 200 {
		t.Fatalf("public get after unhide → %d", rec.Code)
	}
}
