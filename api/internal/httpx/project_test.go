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

func TestCreateAndGetProject(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"pj@dev.cx","password":"pw123456","handle":"pjowner","display_name":"PJ"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='pjowner'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	// 未登录不能建项目
	anon := httptest.NewRequest(http.MethodPost, "/api/projects", strings.NewReader(`{"slug":"x1","name":"X"}`))
	anon.Header.Set("Content-Type", "application/json")
	arec := httptest.NewRecorder()
	srv.ServeHTTP(arec, anon)
	if arec.Code != 401 {
		t.Fatalf("anon create → %d", arec.Code)
	}

	body := `{"slug":"meal-split","name":"AA 分账","tagline":"让 AA 分账毫不费力","description_md":"# 说明",
	          "stage":"wip","tags":["Go","算法"],"screenshots":["https://img.li/a.png"],
	          "links":[{"label":"演示","url":"https://demo.dev"}]}`
	rec := do("POST", "/api/projects", body)
	if rec.Code != 201 || !strings.Contains(rec.Body.String(), `"slug":"meal-split"`) {
		t.Fatalf("create → %d %s", rec.Code, rec.Body)
	}

	// slug 重复
	if rec := do("POST", "/api/projects", body); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "slug_taken") {
		t.Fatalf("dup slug → %d %s", rec.Code, rec.Body)
	}

	// 非法输入
	for _, c := range []struct{ body, want string }{
		{`{"slug":"Bad Slug","name":"X","tagline":"t","stage":"wip"}`, "slug_invalid"},
		{`{"slug":"ok-slug","name":"","tagline":"t","stage":"wip"}`, "bad_input"},
		{`{"slug":"ok-slug","name":"X","tagline":"t","stage":"nonsense"}`, "bad_stage"},
		{`{"slug":"ok-slug","name":"X","tagline":"t","stage":"wip","links":[{"label":"x","url":"javascript:alert(1)"}]}`, "bad_link"},
	} {
		if rec := do("POST", "/api/projects", c.body); rec.Code != 400 ||
			!strings.Contains(rec.Body.String(), c.want) {
			t.Errorf("%s → %d %s, want 400 %s", c.body, rec.Code, rec.Body, c.want)
		}
	}

	// 匿名可读，含 stats 与 author
	pub := httptest.NewRequest(http.MethodGet, "/api/projects/meal-split", nil)
	prec := httptest.NewRecorder()
	srv.ServeHTTP(prec, pub)
	if prec.Code != 200 {
		t.Fatalf("get → %d %s", prec.Code, prec.Body)
	}
	for _, want := range []string{`"handle":"pjowner"`, `"timeline_count":0`, `"tags":["Go","算法"]`} {
		if !strings.Contains(prec.Body.String(), want) {
			t.Errorf("get body missing %s: %s", want, prec.Body)
		}
	}

	if rec := do("GET", "/api/projects/nope", ""); rec.Code != 404 {
		t.Errorf("missing project → %d", rec.Code)
	}
}

func TestPatchProjectOwnershipAndList(t *testing.T) {
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

	alice := mkUser("alice", "a@dev.cx")
	bob := mkUser("bob", "b@dev.cx")

	if rec := send(alice, "POST", "/api/projects",
		`{"slug":"alice-tool","name":"Alice Tool","tagline":"t","stage":"idea"}`); rec.Code != 201 {
		t.Fatalf("create → %d %s", rec.Code, rec.Body)
	}

	// 他人不能改
	if rec := send(bob, "PATCH", "/api/projects/alice-tool", `{"tagline":"hijacked"}`); rec.Code != 403 {
		t.Fatalf("bob patch → %d %s, want 403", rec.Code, rec.Body)
	}
	// owner 可改，且未传字段不变
	rec := send(alice, "PATCH", "/api/projects/alice-tool", `{"stage":"shipped"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"stage":"shipped"`) ||
		!strings.Contains(rec.Body.String(), `"name":"Alice Tool"`) {
		t.Fatalf("patch → %d %s", rec.Code, rec.Body)
	}
	// 非法 stage
	if rec := send(alice, "PATCH", "/api/projects/alice-tool", `{"stage":"bogus"}`); rec.Code != 400 {
		t.Errorf("bad stage → %d", rec.Code)
	}
	// 未登录
	if rec := send("", "PATCH", "/api/projects/alice-tool", `{"stage":"idea"}`); rec.Code != 401 {
		t.Errorf("anon patch → %d", rec.Code)
	}

	// 列表（匿名可读）
	lrec := send("", "GET", "/api/users/alice/projects", "")
	if lrec.Code != 200 || !strings.Contains(lrec.Body.String(), "alice-tool") {
		t.Fatalf("list → %d %s", lrec.Code, lrec.Body)
	}
	if brec := send("", "GET", "/api/users/bob/projects", ""); brec.Code != 200 ||
		!strings.Contains(brec.Body.String(), `"projects":[]`) {
		t.Errorf("bob list → %d %s, want empty array", brec.Code, brec.Body)
	}
	if nrec := send("", "GET", "/api/users/nobody/projects", ""); nrec.Code != 404 {
		t.Errorf("unknown handle → %d", nrec.Code)
	}
}

func TestProjectTimelineAndFeedback(t *testing.T) {
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
	owner := mkUser("towner", "to@dev.cx")
	visitor := mkUser("tvisitor", "tv@dev.cx")

	send(owner, "POST", "/api/projects", `{"slug":"tl-proj","name":"TL","tagline":"t","stage":"wip"}`)
	send(owner, "POST", "/api/posts",
		`{"type":"show","project_slug":"tl-proj","title":"shipped it","body_md":"b"}`)
	send(owner, "POST", "/api/posts",
		`{"type":"build","project_slug":"tl-proj","title":"weekly progress","body_md":"b"}`)

	// 访客不能直接发关联他人项目的帖子
	if rec := send(visitor, "POST", "/api/posts",
		`{"type":"build","project_slug":"tl-proj","title":"not mine","body_md":"b"}`); rec.Code != 403 {
		t.Fatalf("visitor post to others project → %d %s", rec.Code, rec.Body)
	}
	// 但可以提反馈
	fb := send(visitor, "POST", "/api/projects/tl-proj/feedback",
		`{"title":"移动端初始化很慢","body_md":"在 iOS 上首屏 3 秒"}`)
	if fb.Code != 201 {
		t.Fatalf("feedback → %d %s", fb.Code, fb.Body)
	}
	if !strings.Contains(fb.Body.String(), `"type":"discuss"`) ||
		!strings.Contains(fb.Body.String(), `"handle":"tvisitor"`) ||
		!strings.Contains(fb.Body.String(), `"slug":"tl-proj"`) {
		t.Errorf("feedback post shape: %s", fb.Body)
	}
	// 未登录不能提
	if rec := send("", "POST", "/api/projects/tl-proj/feedback", `{"title":"x","body_md":"y"}`); rec.Code != 401 {
		t.Errorf("anon feedback → %d", rec.Code)
	}
	// 空标题
	if rec := send(visitor, "POST", "/api/projects/tl-proj/feedback", `{"title":"","body_md":"y"}`); rec.Code != 400 {
		t.Errorf("empty title → %d", rec.Code)
	}

	tl := send("", "GET", "/api/projects/tl-proj/timeline", "")
	if tl.Code != 200 {
		t.Fatalf("timeline → %d %s", tl.Code, tl.Body)
	}
	body := tl.Body.String()
	if !strings.Contains(body, "shipped it") || !strings.Contains(body, "weekly progress") {
		t.Errorf("timeline missing show/build: %s", body)
	}
	if !strings.Contains(body, "移动端初始化很慢") {
		t.Errorf("discussions missing feedback post: %s", body)
	}
	// 项目 stats 反映：2 条 timeline、1 条 discussion
	pg := send("", "GET", "/api/projects/tl-proj", "")
	if !strings.Contains(pg.Body.String(), `"timeline_count":2`) ||
		!strings.Contains(pg.Body.String(), `"discuss_count":1`) {
		t.Errorf("stats: %s", pg.Body)
	}
}

func TestProjectAudience(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"aud@dev.cx","password":"pw123456","handle":"audowner","display_name":"AU"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='audowner'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	// 创建时带多选 audience,读取返回同值(0013 起数组化)
	rec := do("POST", "/api/projects",
		`{"slug":"aud-cli","name":"CLI 工具","stage":"wip","audience":["developers","end_users"]}`)
	if rec.Code != 201 || !strings.Contains(rec.Body.String(), `"audience":["developers","end_users"]`) {
		t.Fatalf("create with audience → %d %s", rec.Code, rec.Body)
	}

	// 不带 audience 默认空数组
	rec = do("POST", "/api/projects", `{"slug":"aud-none","name":"无受众","stage":"idea"}`)
	if rec.Code != 201 || !strings.Contains(rec.Body.String(), `"audience":[]`) {
		t.Fatalf("create default audience → %d %s", rec.Code, rec.Body)
	}

	// patch 更新生效
	rec = do("PATCH", "/api/projects/aud-cli", `{"audience":["teams"]}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"audience":["teams"]`) {
		t.Fatalf("patch audience → %d %s", rec.Code, rec.Body)
	}
	// patch 其他字段不动 audience
	rec = do("PATCH", "/api/projects/aud-cli", `{"tagline":"更好用"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"audience":["teams"]`) {
		t.Fatalf("patch keeps audience → %d %s", rec.Code, rec.Body)
	}
	// 清空
	rec = do("PATCH", "/api/projects/aud-cli", `{"audience":[]}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"audience":[]`) {
		t.Fatalf("clear audience → %d %s", rec.Code, rec.Body)
	}

	// 重复项保序去重,不算错
	rec = do("PATCH", "/api/projects/aud-cli", `{"audience":["teams","teams","end_users"]}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"audience":["teams","end_users"]`) {
		t.Fatalf("dedup audience → %d %s", rec.Code, rec.Body)
	}

	// 非法值 400
	rec = do("POST", "/api/projects",
		`{"slug":"aud-bad","name":"X","stage":"wip","audience":["aliens"]}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "bad_audience") {
		t.Fatalf("bad audience → %d %s", rec.Code, rec.Body)
	}
}

// PATCH 与 POST 同过 writeGate:邮箱未验证/被禁言的用户不能改写既有项目。
func TestPatchProjectWriteGate(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()
	codes, _ := invite.Mint(ctx, pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"gate@dev.cx","password":"pw123456","handle":"gateowner","display_name":"G"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	pool.Exec(ctx, `update users set email_verified_at=now() where handle='gateowner'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	if rec := do("POST", "/api/projects", `{"slug":"gate-p","name":"G","stage":"idea"}`); rec.Code != 201 {
		t.Fatalf("create → %d %s", rec.Code, rec.Body)
	}

	// 取消邮箱验证 → PATCH 403 email_unverified
	pool.Exec(ctx, `update users set email_verified_at=null where handle='gateowner'`)
	if rec := do("PATCH", "/api/projects/gate-p", `{"tagline":"x"}`); rec.Code != 403 ||
		!strings.Contains(rec.Body.String(), "email_unverified") {
		t.Fatalf("unverified patch → %d %s, want 403 email_unverified", rec.Code, rec.Body)
	}

	// 恢复验证但禁言 → PATCH 403 muted
	pool.Exec(ctx, `update users set email_verified_at=now(), muted_until=now()+interval '1 hour' where handle='gateowner'`)
	if rec := do("PATCH", "/api/projects/gate-p", `{"tagline":"x"}`); rec.Code != 403 ||
		!strings.Contains(rec.Body.String(), "muted") {
		t.Fatalf("muted patch → %d %s, want 403 muted", rec.Code, rec.Body)
	}

	// 解除后恢复可写
	pool.Exec(ctx, `update users set muted_until=null where handle='gateowner'`)
	if rec := do("PATCH", "/api/projects/gate-p", `{"tagline":"ok"}`); rec.Code != 200 {
		t.Fatalf("restored patch → %d %s", rec.Code, rec.Body)
	}
}
