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

func TestDraftUpsertPublishAndVisibility(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 2, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"dr@dev.cx","password":"pw123456","handle":"drafter","display_name":"D"}`)
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='drafter'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	if rec := send("POST", "/api/projects",
		`{"slug":"draft-proj","name":"DP","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("project → %d %s", rec.Code, rec.Body)
	}

	// 空标题草稿
	rec := send("POST", "/api/posts",
		`{"type":"build","project_slug":"draft-proj","title":"","body_md":"wip notes","status":"draft"}`)
	if rec.Code != 201 {
		t.Fatalf("create draft → %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(rec.Body.String(), `"status":"draft"`) {
		t.Fatalf("want status draft: %s", rec.Body)
	}
	slug := extractSlug(t, rec.Body.String())

	// 公开列表不可见
	list := send("GET", "/api/posts", "")
	if list.Code != 200 || strings.Contains(list.Body.String(), slug) {
		t.Fatalf("public list should hide draft: %d %s", list.Code, list.Body)
	}

	// 作者可读
	get := send("GET", "/api/posts/"+slug, "")
	if get.Code != 200 || !strings.Contains(get.Body.String(), "wip notes") {
		t.Fatalf("author get draft → %d %s", get.Code, get.Body)
	}

	// upsert 同 draft_slug
	up := send("POST", "/api/posts",
		`{"type":"build","project_slug":"draft-proj","title":"Week 1 build",
		  "body_md":"updated body","status":"draft","draft_slug":"`+slug+`"}`)
	if up.Code != 200 {
		t.Fatalf("upsert draft → %d %s", up.Code, up.Body)
	}
	var n int
	pool.QueryRow(context.Background(),
		`select count(*) from posts where author_id=(select id from users where handle='drafter') and status='draft'`).Scan(&n)
	if n != 1 {
		t.Fatalf("want 1 draft row, got %d", n)
	}

	// me/drafts
	dl := send("GET", "/api/me/drafts", "")
	if dl.Code != 200 || !strings.Contains(dl.Body.String(), slug) {
		t.Fatalf("me/drafts → %d %s", dl.Code, dl.Body)
	}

	// 他人不可见
	reg2 := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[1]+`","email":"ot@dev.cx","password":"pw123456","handle":"other1","display_name":"O"}`)
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='other1'`)
	ck2 := strings.Split(reg2.Header().Get("Set-Cookie"), ";")[0]
	req := httptest.NewRequest("GET", "/api/posts/"+slug, nil)
	req.Header.Set("Cookie", ck2)
	orec := httptest.NewRecorder()
	srv.ServeHTTP(orec, req)
	if orec.Code != 404 {
		t.Fatalf("other get draft → %d %s", orec.Code, orec.Body)
	}

	// 发布
	pub := send("POST", "/api/posts",
		`{"type":"build","project_slug":"draft-proj","title":"Week 1 build",
		  "body_md":"shipped","status":"published","draft_slug":"`+slug+`"}`)
	if pub.Code != 200 || !strings.Contains(pub.Body.String(), `"status":"published"`) {
		t.Fatalf("publish draft → %d %s", pub.Code, pub.Body)
	}
	list2 := send("GET", "/api/posts", "")
	if !strings.Contains(list2.Body.String(), slug) {
		t.Fatalf("published should appear in list: %s", list2.Body)
	}
	dl2 := send("GET", "/api/me/drafts", "")
	if strings.Contains(dl2.Body.String(), slug) {
		t.Fatalf("published must leave drafts: %s", dl2.Body)
	}

	// 删除仅草稿
	rec3 := send("POST", "/api/posts",
		`{"type":"discuss","title":"tmp","body_md":"x","status":"draft"}`)
	dslug := extractSlug(t, rec3.Body.String())
	del := send("DELETE", "/api/posts/"+dslug, "")
	if del.Code != 204 {
		t.Fatalf("delete draft → %d %s", del.Code, del.Body)
	}
	delPub := send("DELETE", "/api/posts/"+slug, "")
	if delPub.Code != 409 {
		t.Fatalf("delete published → %d want 409", delPub.Code)
	}
}

func TestCreatePostDefaultPublished(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"np@dev.cx","password":"pw123456","handle":"nopub","display_name":"N"}`)
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='nopub'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	req := httptest.NewRequest("POST", "/api/posts",
		strings.NewReader(`{"type":"discuss","title":"hello","body_md":"world"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", cookie)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != 201 || !strings.Contains(rec.Body.String(), `"status":"published"`) {
		t.Fatalf("default publish → %d %s", rec.Code, rec.Body)
	}
}
