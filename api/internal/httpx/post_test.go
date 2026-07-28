package httpx_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func extractSlug(t *testing.T, body string) string {
	t.Helper()
	const key = `"slug":"`
	// encoding/json marshals map[string]any keys in sorted order, so when a post
	// carries a project, the nested `"project":{"...,"slug":...}` block sorts
	// before the post's own top-level "slug" key and its "slug":".." occurs first
	// in the byte stream. Use the last match, which is always the post's own —
	// nothing that can sort after "slug" (title/type/uncertainties) nests a slug.
	i := strings.LastIndex(body, key)
	if i < 0 {
		t.Fatalf("no slug in %s", body)
	}
	rest := body[i+len(key):]
	j := strings.Index(rest, `"`)
	if j < 0 {
		t.Fatalf("unterminated slug in %s", body)
	}
	return rest[:j]
}

func extractCursor(t *testing.T, body string) string {
	t.Helper()
	const key = `"next_cursor":"`
	i := strings.Index(body, key)
	if i < 0 {
		t.Fatalf("no cursor in %s", body)
	}
	rest := body[i+len(key):]
	j := strings.Index(rest, `"`)
	return rest[:j]
}

func TestCreateAndGetPost(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"po@dev.cx","password":"pw123456","handle":"poster","display_name":"P"}`)
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='poster'`)
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
		`{"slug":"post-proj","name":"Proj","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("project → %d %s", rec.Code, rec.Body)
	}

	// show 必须带项目
	if rec := send("POST", "/api/posts",
		`{"type":"show","title":"无项目的 Show","body_md":"x"}`); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "project_required") {
		t.Fatalf("show without project → %d %s", rec.Code, rec.Body)
	}

	rec := send("POST", "/api/posts",
		`{"type":"show","project_slug":"post-proj","title":"Raft election timeout tuning","body_md":"正文",
		  "feedback_wanted":["算法正确性"],"uncertainties":["精度问题"],
		  "links":[{"label":"仓库","url":"https://github.com/x/y"}]}`)
	if rec.Code != 201 {
		t.Fatalf("create → %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(rec.Body.String(), `"slug":"raft-election-timeout`) {
		t.Errorf("slug not derived from title: %s", rec.Body)
	}
	slug := extractSlug(t, rec.Body.String())

	// 匿名可读，含 project 与 author，reply_count 为 0
	pub := httptest.NewRequest(http.MethodGet, "/api/posts/"+slug, nil)
	prec := httptest.NewRecorder()
	srv.ServeHTTP(prec, pub)
	if prec.Code != 200 {
		t.Fatalf("get → %d %s", prec.Code, prec.Body)
	}
	for _, want := range []string{`"handle":"poster"`, `"slug":"post-proj"`, `"reply_count":0`,
		`"uncertainties":["精度问题"]`, `"merged_from":[]`} {
		if !strings.Contains(prec.Body.String(), want) {
			t.Errorf("body missing %s: %s", want, prec.Body)
		}
	}

	// 校验分支
	for _, c := range []struct{ body, want string }{
		{`{"type":"bogus","title":"T","body_md":"b"}`, "bad_type"},
		{`{"type":"discuss","title":"","body_md":"b"}`, "bad_input"},
		{`{"type":"build","project_slug":"nope","title":"T","body_md":"b"}`, "project_not_found"},
		{`{"type":"discuss","title":"T","body_md":"b","links":[{"label":"x","url":"javascript:1"}]}`, "bad_link"},
	} {
		if rec := send("POST", "/api/posts", c.body); rec.Code != 400 ||
			!strings.Contains(rec.Body.String(), c.want) {
			t.Errorf("%s → %d %s, want 400 %s", c.body, rec.Code, rec.Body, c.want)
		}
	}
	if rec := send("GET", "/api/posts/does-not-exist", ""); rec.Code != 404 {
		t.Errorf("missing post → %d", rec.Code)
	}
}

func TestPatchAndListPosts(t *testing.T) {
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
	author := mkUser("writer", "w@dev.cx")
	other := mkUser("reader", "r@dev.cx")

	send(author, "POST", "/api/projects", `{"slug":"list-proj","name":"L","tagline":"t","stage":"wip"}`)
	var slugs []string
	for i, title := range []string{"first build note", "second build note", "third discuss note"} {
		typ, ps := "build", `"project_slug":"list-proj",`
		if i == 2 {
			typ, ps = "discuss", ""
		}
		rec := send(author, "POST", "/api/posts",
			`{"type":"`+typ+`",`+ps+`"title":"`+title+`","body_md":"b"}`)
		if rec.Code != 201 {
			t.Fatalf("create %d → %d %s", i, rec.Code, rec.Body)
		}
		slugs = append(slugs, extractSlug(t, rec.Body.String()))
	}

	// 他人不能改
	if rec := send(other, "PATCH", "/api/posts/"+slugs[0], `{"title":"hijack"}`); rec.Code != 403 {
		t.Fatalf("other patch → %d", rec.Code)
	}
	// 作者可改标题与正文；slug 不随标题变（外链稳定）
	rec := send(author, "PATCH", "/api/posts/"+slugs[0], `{"title":"renamed build note"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"title":"renamed build note"`) ||
		!strings.Contains(rec.Body.String(), `"slug":"`+slugs[0]+`"`) {
		t.Fatalf("patch → %d %s", rec.Code, rec.Body)
	}

	// 列表：全部 3 条
	all := send("", "GET", "/api/posts", "")
	if all.Code != 200 {
		t.Fatalf("list → %d %s", all.Code, all.Body)
	}
	if n := strings.Count(all.Body.String(), `"body_md"`); n != 3 {
		t.Errorf("list count = %d, want 3", n)
	}
	// 按 type 过滤
	if b := send("", "GET", "/api/posts?type=discuss", ""); strings.Count(b.Body.String(), `"body_md"`) != 1 {
		t.Errorf("type filter: %s", b.Body)
	}
	// 按项目过滤
	if b := send("", "GET", "/api/posts?project=list-proj", ""); strings.Count(b.Body.String(), `"body_md"`) != 2 {
		t.Errorf("project filter: %s", b.Body)
	}
	// 按作者过滤
	if b := send("", "GET", "/api/posts?author=writer", ""); strings.Count(b.Body.String(), `"body_md"`) != 3 {
		t.Errorf("author filter: %s", b.Body)
	}
	// 分页：limit=2 给出 next_cursor，翻页拿到第 3 条且无重复
	p1 := send("", "GET", "/api/posts?limit=2", "")
	if strings.Count(p1.Body.String(), `"body_md"`) != 2 || !strings.Contains(p1.Body.String(), `"next_cursor":"`) {
		t.Fatalf("page1: %s", p1.Body)
	}
	cur := extractCursor(t, p1.Body.String())
	p2 := send("", "GET", "/api/posts?limit=2&cursor="+url.QueryEscape(cur), "")
	if strings.Count(p2.Body.String(), `"body_md"`) != 1 {
		t.Fatalf("page2: %s", p2.Body)
	}
	if !strings.Contains(p2.Body.String(), `"next_cursor":null`) {
		t.Errorf("page2 should end pagination: %s", p2.Body)
	}
}

func TestMergePosts(t *testing.T) {
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
	a := mkUser("merger", "m1@dev.cx")
	b := mkUser("dupauthor", "m2@dev.cx")
	c := mkUser("bystander", "m3@dev.cx")

	target := extractSlug(t, send(a, "POST", "/api/posts",
		`{"type":"discuss","title":"canonical topic","body_md":"b"}`).Body.String())
	dup := extractSlug(t, send(b, "POST", "/api/posts",
		`{"type":"discuss","title":"duplicate topic","body_md":"b"}`).Body.String())

	// 无关的人不能合并
	if rec := send(c, "POST", "/api/posts/"+dup+"/merge", `{"into":"`+target+`"}`); rec.Code != 403 {
		t.Fatalf("bystander merge → %d %s", rec.Code, rec.Body)
	}
	// 自合并
	if rec := send(b, "POST", "/api/posts/"+dup+"/merge", `{"into":"`+dup+`"}`); rec.Code != 400 {
		t.Errorf("self merge → %d", rec.Code)
	}
	// 目标帖作者合并（a 是 target 作者）
	if rec := send(a, "POST", "/api/posts/"+dup+"/merge", `{"into":"`+target+`"}`); rec.Code != 200 {
		t.Fatalf("merge → %d %s", rec.Code, rec.Body)
	}
	// 目标帖列出 merged_from
	tg := send("", "GET", "/api/posts/"+target, "")
	if !strings.Contains(tg.Body.String(), "duplicate topic") ||
		!strings.Contains(tg.Body.String(), `"handle":"dupauthor"`) {
		t.Errorf("merged_from: %s", tg.Body)
	}
	// 被合并帖仍可访问且带 merged_into
	dg := send("", "GET", "/api/posts/"+dup, "")
	if dg.Code != 200 || !strings.Contains(dg.Body.String(), `"merged_into":"`) {
		t.Errorf("dup after merge: %d %s", dg.Code, dg.Body)
	}
	// 从列表消失
	if l := send("", "GET", "/api/posts", ""); strings.Contains(l.Body.String(), "duplicate topic") {
		t.Errorf("merged post still listed: %s", l.Body)
	}
	// 不能重复合并
	if rec := send(b, "POST", "/api/posts/"+dup+"/merge", `{"into":"`+target+`"}`); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "already_merged") {
		t.Errorf("re-merge → %d %s", rec.Code, rec.Body)
	}
	// 不能合并到已被合并的帖（防链）
	third := extractSlug(t, send(a, "POST", "/api/posts",
		`{"type":"discuss","title":"third topic","body_md":"b"}`).Body.String())
	if rec := send(a, "POST", "/api/posts/"+third+"/merge", `{"into":"`+dup+`"}`); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "target_merged") {
		t.Errorf("merge into merged → %d %s", rec.Code, rec.Body)
	}
}

// TestMergeTypeGateAndUnmerge 覆盖两个 Critical 修复点：
//  1. 合并端点只接受 ask/discuss 双方——show/build 这类项目正文不能被合并走
//     （原漏洞：Bob 能把 Alice 挂在项目上的 show 帖合并进自己的 discuss 帖，
//     让它从项目时间线/列表里永久消失，Alice 无法撤销）。
//  2. 新增的 DELETE .../merge 撤销路径：源帖作者或当初执行合并的人可以撤销，
//     无关第三方不行，未合并的帖子不行。
func TestMergeTypeGateAndUnmerge(t *testing.T) {
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
	alice := mkUser("alice-tg", "alice-tg@dev.cx")
	bob := mkUser("bob-tg", "bob-tg@dev.cx")
	carol := mkUser("carol-tg", "carol-tg@dev.cx")
	stranger := mkUser("stranger-tg", "stranger-tg@dev.cx")

	send(alice, "POST", "/api/projects", `{"slug":"tg-proj","name":"P","tagline":"t","stage":"wip"}`)
	aliceShow := extractSlug(t, send(alice, "POST", "/api/posts",
		`{"type":"show","project_slug":"tg-proj","title":"alice show post","body_md":"b"}`).Body.String())
	bobDiscuss := extractSlug(t, send(bob, "POST", "/api/posts",
		`{"type":"discuss","title":"bob discuss post","body_md":"b"}`).Body.String())
	carolDup1 := extractSlug(t, send(carol, "POST", "/api/posts",
		`{"type":"discuss","title":"carol duplicate one","body_md":"b"}`).Body.String())
	carolDup2 := extractSlug(t, send(carol, "POST", "/api/posts",
		`{"type":"discuss","title":"carol duplicate two","body_md":"b"}`).Body.String())

	// (a) show 帖合并进 discuss 帖 → 400 bad_type。bob 是 bobDiscuss 的作者，按旧的
	// 权限规则（uid == srcAuthor || uid == dstAuthor）他本可以合并任意帖子进
	// 自己的 discuss 帖——这正是原漏洞：类型闸门必须先于权限检查拦下它。
	if rec := send(bob, "POST", "/api/posts/"+aliceShow+"/merge", `{"into":"`+bobDiscuss+`"}`); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "bad_type") {
		t.Fatalf("show→discuss merge → %d %s, want 400 bad_type", rec.Code, rec.Body)
	}
	// (b) discuss 合并进 show 帖 → 400 bad_type（反向同样拒绝）
	if rec := send(bob, "POST", "/api/posts/"+bobDiscuss+"/merge", `{"into":"`+aliceShow+`"}`); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "bad_type") {
		t.Fatalf("discuss→show merge → %d %s, want 400 bad_type", rec.Code, rec.Body)
	}
	// alice 的 show 帖两次尝试都没被合并走，仍然挂在项目时间线上
	if tl := send("", "GET", "/api/projects/tg-proj/timeline", ""); !strings.Contains(tl.Body.String(), "alice show post") {
		t.Errorf("alice's show post should still be on the project timeline: %s", tl.Body)
	}

	// (c) discuss→discuss 仍然放行，不要改坏既有行为。carol（源帖作者）发起合并。
	if rec := send(carol, "POST", "/api/posts/"+carolDup1+"/merge", `{"into":"`+bobDiscuss+`"}`); rec.Code != 200 {
		t.Fatalf("discuss→discuss merge (source author) → %d %s, want 200", rec.Code, rec.Body)
	}
	// bob（目标帖作者，非源帖作者）也可以发起合并——覆盖 merged_by != 源帖作者的场景，
	// 用来验证下面撤销路径里 merged_by 分支。
	if rec := send(bob, "POST", "/api/posts/"+carolDup2+"/merge", `{"into":"`+bobDiscuss+`"}`); rec.Code != 200 {
		t.Fatalf("discuss→discuss merge (target author) → %d %s, want 200", rec.Code, rec.Body)
	}

	// (f) 对未合并的帖 DELETE merge → 400 not_merged
	if rec := send(alice, "DELETE", "/api/posts/"+aliceShow+"/merge", ""); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "not_merged") {
		t.Fatalf("unmerge unmerged post → %d %s, want 400 not_merged", rec.Code, rec.Body)
	}

	// (e) 无关第三方 DELETE merge → 403
	if rec := send(stranger, "DELETE", "/api/posts/"+carolDup1+"/merge", ""); rec.Code != 403 {
		t.Fatalf("bystander unmerge → %d %s, want 403", rec.Code, rec.Body)
	}
	// 未登录 → 401
	if rec := send("", "DELETE", "/api/posts/"+carolDup1+"/merge", ""); rec.Code != 401 {
		t.Fatalf("anon unmerge → %d, want 401", rec.Code)
	}
	// 帖子不存在 → 404
	if rec := send(carol, "DELETE", "/api/posts/does-not-exist/merge", ""); rec.Code != 404 {
		t.Fatalf("unmerge missing post → %d, want 404", rec.Code)
	}

	// (d) 合并后 source 作者 DELETE merge → 200，且该帖重新出现在 GET /api/posts 列表里。
	// 这是 Alice 场景里缺失的撤销路径：不依赖对方配合，源帖作者自己就能拿回帖子。
	if rec := send(carol, "DELETE", "/api/posts/"+carolDup1+"/merge", ""); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), `"merged_into":null`) {
		t.Fatalf("unmerge by source author → %d %s, want 200 merged_into:null", rec.Code, rec.Body)
	}
	if l := send("", "GET", "/api/posts", ""); !strings.Contains(l.Body.String(), "carol duplicate one") {
		t.Errorf("unmerged post should reappear in listing: %s", l.Body)
	}

	// merged_by（bob，当初执行合并的人，非源帖作者）同样可以撤销 carolDup2
	if rec := send(bob, "DELETE", "/api/posts/"+carolDup2+"/merge", ""); rec.Code != 200 ||
		!strings.Contains(rec.Body.String(), `"merged_into":null`) {
		t.Fatalf("unmerge by merged_by → %d %s, want 200 merged_into:null", rec.Code, rec.Body)
	}
	if l := send("", "GET", "/api/posts", ""); !strings.Contains(l.Body.String(), "carol duplicate two") {
		t.Errorf("unmerged post should reappear in listing: %s", l.Body)
	}
}

// TestMergedIntoEnrichment 覆盖 postJSON 新增的 merged_into_post/merged_at 内联字段：
// merged_into 本身只是目标帖的 id，没有 GET-by-id 端点，前端渲染"已合并至"横幅需要
// 目标帖的 slug（拼链接）和 title（显示文案），所以 GET 详情顺带把目标帖的 slug/title
// 查出来内联进响应；merged_at 是合并发生的时间戳。两个字段都只在这条帖子确实被合并时
// 才出现，普通帖子的响应体里不应该带上它们（哪怕是 null）。
func TestMergedIntoEnrichment(t *testing.T) {
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
	a := mkUser("mi-author", "mi1@dev.cx")

	target := extractSlug(t, send(a, "POST", "/api/posts",
		`{"type":"discuss","title":"mi target topic","body_md":"b"}`).Body.String())
	dup := extractSlug(t, send(a, "POST", "/api/posts",
		`{"type":"discuss","title":"mi duplicate topic","body_md":"b"}`).Body.String())

	if rec := send(a, "POST", "/api/posts/"+dup+"/merge", `{"into":"`+target+`"}`); rec.Code != 200 {
		t.Fatalf("merge → %d %s", rec.Code, rec.Body)
	}

	// 被合并帖：merged_into_post 内联目标帖的 slug/title，merged_at 是个时间戳
	dg := send("", "GET", "/api/posts/"+dup, "")
	if dg.Code != 200 {
		t.Fatalf("get dup → %d %s", dg.Code, dg.Body)
	}
	if !strings.Contains(dg.Body.String(), `"merged_into_post":{"slug":"`+target+`","title":"mi target topic"}`) {
		t.Errorf("merged_into_post missing/wrong shape on dup: %s", dg.Body)
	}
	if !strings.Contains(dg.Body.String(), `"merged_at":"`) {
		t.Errorf("merged_at missing on dup: %s", dg.Body)
	}

	// 正常（未合并）帖：merged_into_post/merged_at 都不应出现
	tg := send("", "GET", "/api/posts/"+target, "")
	if tg.Code != 200 {
		t.Fatalf("get target → %d %s", tg.Code, tg.Body)
	}
	if strings.Contains(tg.Body.String(), `"merged_into_post"`) {
		t.Errorf("normal post should not carry merged_into_post: %s", tg.Body)
	}
	if strings.Contains(tg.Body.String(), `"merged_at"`) {
		t.Errorf("normal post should not carry merged_at: %s", tg.Body)
	}
}
