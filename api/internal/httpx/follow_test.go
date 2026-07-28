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

func TestFollowProject(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})

	mkUser := func(handle, email string) string {
		codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
		reg := postJSON(t, srv, "/api/auth/register",
			`{"invite_code":"`+codes[0]+`","email":"`+email+`","password":"pw123456","handle":"`+handle+`","display_name":"U"}`)
		if reg.Code != 201 {
			t.Fatalf("register %s → %d %s", handle, reg.Code, reg.Body)
		}
		pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='`+handle+`'`)
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

	owner := mkUser("pjowner", "pjowner@dev.cx")
	follower := mkUser("follower", "follower@dev.cx")

	if rec := send(owner, "POST", "/api/projects",
		`{"slug":"follow-me","name":"Follow Me","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("create project → %d %s", rec.Code, rec.Body)
	}

	// 关注 project → 204
	if rec := send(follower, "PUT", "/api/follows/project/follow-me", ""); rec.Code != 204 {
		t.Fatalf("follow project → %d %s", rec.Code, rec.Body)
	}
	// 再次关注 → 204 幂等
	if rec := send(follower, "PUT", "/api/follows/project/follow-me", ""); rec.Code != 204 {
		t.Fatalf("refollow project → %d %s", rec.Code, rec.Body)
	}

	// 登录 GET 含 follower_count 与 viewer_following
	rec := send(follower, "GET", "/api/projects/follow-me", "")
	if rec.Code != 200 {
		t.Fatalf("get project → %d %s", rec.Code, rec.Body)
	}
	body := rec.Body.String()
	for _, want := range []string{`"follower_count":1`, `"viewer_following":true`} {
		if !strings.Contains(body, want) {
			t.Errorf("logged-in get missing %s: %s", want, body)
		}
	}

	// 匿名 GET 有 follower_count，无 viewer_following 键
	arec := send("", "GET", "/api/projects/follow-me", "")
	if arec.Code != 200 {
		t.Fatalf("anon get → %d %s", arec.Code, arec.Body)
	}
	abody := arec.Body.String()
	if !strings.Contains(abody, `"follower_count":1`) {
		t.Errorf("anon get missing follower_count: %s", abody)
	}
	if strings.Contains(abody, `viewer_following`) {
		t.Errorf("anon get should omit viewer_following: %s", abody)
	}

	// 取关 → 204；count 回 0
	if rec := send(follower, "DELETE", "/api/follows/project/follow-me", ""); rec.Code != 204 {
		t.Fatalf("unfollow → %d %s", rec.Code, rec.Body)
	}
	rec = send(follower, "GET", "/api/projects/follow-me", "")
	if !strings.Contains(rec.Body.String(), `"follower_count":0`) {
		t.Errorf("after unfollow count: %s", rec.Body)
	}
	if !strings.Contains(rec.Body.String(), `"viewer_following":false`) {
		t.Errorf("after unfollow viewer_following: %s", rec.Body)
	}
}

func TestFollowUser(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})

	mkUser := func(handle, email string) string {
		codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
		reg := postJSON(t, srv, "/api/auth/register",
			`{"invite_code":"`+codes[0]+`","email":"`+email+`","password":"pw123456","handle":"`+handle+`","display_name":"U"}`)
		if reg.Code != 201 {
			t.Fatalf("register %s → %d %s", handle, reg.Code, reg.Body)
		}
		return strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	}
	send := func(cookie, method, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	alice := mkUser("alicef", "alicef@dev.cx")
	_ = mkUser("bobf", "bobf@dev.cx")

	// 关注 user → 204
	if rec := send(alice, "PUT", "/api/follows/user/bobf"); rec.Code != 204 {
		t.Fatalf("follow user → %d %s", rec.Code, rec.Body)
	}

	// resolve 含 follower_count
	rec := send("", "GET", "/api/resolve/bobf")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"follower_count":1`) {
		t.Fatalf("resolve after follow → %d %s", rec.Code, rec.Body)
	}
	// 登录 viewer 看到 following
	rec = send(alice, "GET", "/api/resolve/bobf")
	if !strings.Contains(rec.Body.String(), `"viewer_following":true`) {
		t.Errorf("viewer resolve: %s", rec.Body)
	}

	// 目标用户收到一条 kind=follow 通知
	var nCount int
	if err := pool.QueryRow(context.Background(),
		`select count(*) from notifications n
		 join users u on u.id = n.user_id
		 where u.handle = 'bobf' and n.kind = 'follow'`).Scan(&nCount); err != nil {
		t.Fatalf("count notifications: %v", err)
	}
	if nCount != 1 {
		t.Fatalf("notifications after follow = %d, want 1", nCount)
	}

	// 重复关注不新增通知
	if rec := send(alice, "PUT", "/api/follows/user/bobf"); rec.Code != 204 {
		t.Fatalf("refollow user → %d %s", rec.Code, rec.Body)
	}
	if err := pool.QueryRow(context.Background(),
		`select count(*) from notifications n
		 join users u on u.id = n.user_id
		 where u.handle = 'bobf' and n.kind = 'follow'`).Scan(&nCount); err != nil {
		t.Fatalf("recount notifications: %v", err)
	}
	if nCount != 1 {
		t.Fatalf("notifications after refollow = %d, want 1", nCount)
	}
}

func TestFollowErrors(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})

	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"solo@dev.cx","password":"pw123456","handle":"solo","display_name":"Solo"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	send := func(cookie, method, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	// 自关注
	if rec := send(cookie, "PUT", "/api/follows/user/solo"); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "bad_target") {
		t.Errorf("self-follow → %d %s, want 400 bad_target", rec.Code, rec.Body)
	}
	// 非法 kind
	if rec := send(cookie, "PUT", "/api/follows/cat/solo"); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "bad_kind") {
		t.Errorf("bad kind → %d %s, want 400 bad_kind", rec.Code, rec.Body)
	}
	// 不存在的 slug
	if rec := send(cookie, "PUT", "/api/follows/project/no-such-slug"); rec.Code != 404 ||
		!strings.Contains(rec.Body.String(), "not_found") {
		t.Errorf("missing project → %d %s, want 404", rec.Code, rec.Body)
	}
	// 匿名 PUT → 401
	if rec := send("", "PUT", "/api/follows/user/solo"); rec.Code != 401 ||
		!strings.Contains(rec.Body.String(), "auth_required") {
		t.Errorf("anon put → %d %s, want 401", rec.Code, rec.Body)
	}
}
