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

func TestHiddenContentPaths(t *testing.T) {
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
	authorCk := mkUser("author1", "author1@dev.cx")
	readerCk := mkUser("reader1", "reader1@dev.cx")
	pool.Exec(ctx, `update users set role='admin' where handle='op'`)

	if rec := send(authorCk, "POST", "/api/posts",
		`{"type":"discuss","title":"secret sauce","body_md":"the body"}`); rec.Code != 201 {
		t.Fatalf("create → %d %s", rec.Code, rec.Body)
	}
	var slug string
	pool.QueryRow(ctx, `select slug from posts where title='secret sauce'`).Scan(&slug)
	// 一条将被隐藏的回复
	rrec := send(readerCk, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"rude reply"}`)
	if rrec.Code != 201 {
		t.Fatalf("reply → %d %s", rrec.Code, rrec.Body)
	}
	var replyID string
	pool.QueryRow(ctx, `select id from replies where body_md='rude reply'`).Scan(&replyID)

	// 隐藏回复:陌生人列表里 body 为空 + hidden 标记;作者/admin 可见原文
	if rec := send(adminCk, "POST", "/api/admin/replies/"+replyID+"/hide", `{"reason":"attack"}`); rec.Code != 204 {
		t.Fatalf("hide reply → %d %s", rec.Code, rec.Body)
	}
	lrec := send(authorCk, "GET", "/api/posts/"+slug+"/replies", "")
	if !strings.Contains(lrec.Body.String(), `"hidden":true`) {
		t.Errorf("reply list missing hidden flag: %s", lrec.Body)
	}
	if strings.Contains(lrec.Body.String(), "rude reply") {
		t.Errorf("stranger-visible reply body not blanked: %s", lrec.Body)
	}
	rlrec := send(readerCk, "GET", "/api/posts/"+slug+"/replies", "")
	if !strings.Contains(rlrec.Body.String(), "rude reply") {
		t.Errorf("author of reply should still see own body: %s", rlrec.Body)
	}

	// 隐藏帖子
	if rec := send(adminCk, "POST", "/api/admin/posts/"+slug+"/hide", `{"reason":"红线"}`); rec.Code != 204 {
		t.Fatalf("hide post → %d", rec.Code)
	}
	// 列表不出现
	if rec := send(readerCk, "GET", "/api/posts", ""); strings.Contains(rec.Body.String(), "secret sauce") {
		t.Errorf("hidden post leaked into list: %s", rec.Body)
	}
	// 陌生人直链:墓碑(hidden + 空正文)
	grec := send(readerCk, "GET", "/api/posts/"+slug, "")
	if grec.Code != 200 || !strings.Contains(grec.Body.String(), `"hidden":true`) {
		t.Fatalf("tombstone → %d %s", grec.Code, grec.Body)
	}
	if strings.Contains(grec.Body.String(), "the body") || strings.Contains(grec.Body.String(), "secret sauce") {
		t.Errorf("tombstone leaked content: %s", grec.Body)
	}
	// 作者直链:原文 + hidden 标记
	arec := send(authorCk, "GET", "/api/posts/"+slug, "")
	if !strings.Contains(arec.Body.String(), "the body") || !strings.Contains(arec.Body.String(), `"hidden":true`) {
		t.Errorf("author view wrong: %s", arec.Body)
	}
	// admin 直链:原文
	adrec := send(adminCk, "GET", "/api/posts/"+slug, "")
	if !strings.Contains(adrec.Body.String(), "the body") {
		t.Errorf("admin view wrong: %s", adrec.Body)
	}
	// 隐藏帖上不能再回复
	if rec := send(readerCk, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"more"}`); rec.Code != 404 {
		t.Errorf("reply on hidden post → %d, want 404", rec.Code)
	}
	// 作者也不能编辑隐藏帖
	if rec := send(authorCk, "PATCH", "/api/posts/"+slug, `{"title":"new"}`); rec.Code != 403 {
		t.Errorf("patch hidden post → %d, want 403", rec.Code)
	}
	// stats 的 discussions 不计隐藏帖(此时只有隐藏这一帖 → 0)
	srec := send("", "GET", "/api/stats", "")
	if !strings.Contains(srec.Body.String(), `"discussions":0`) {
		t.Errorf("stats counts hidden post: %s", srec.Body)
	}
}
