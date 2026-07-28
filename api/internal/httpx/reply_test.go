package httpx_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func extractID(t *testing.T, body string) string {
	t.Helper()
	const key = `"id":"`
	// Same key-sorting gotcha as extractSlug (see post_test.go): a reply's JSON
	// nests its author object, whose own "id" key sorts alphabetically before
	// the reply's "id" key. Use the last match, which is always the reply's own.
	i := strings.LastIndex(body, key)
	if i < 0 {
		t.Fatalf("no id in %s", body)
	}
	rest := body[i+len(key):]
	j := strings.Index(rest, `"`)
	return rest[:j]
}

func TestRepliesFloorsAndNesting(t *testing.T) {
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
	author := mkUser("thrower", "t1@dev.cx")
	guest := mkUser("guest", "t2@dev.cx")

	send(author, "POST", "/api/projects", `{"slug":"reply-proj","name":"R","tagline":"t","stage":"wip"}`)
	pr := send(author, "POST", "/api/posts",
		`{"type":"show","project_slug":"reply-proj","title":"reply target","body_md":"b"}`)
	slug := extractSlug(t, pr.Body.String())

	// 未登录不能回复
	if rec := send("", "POST", "/api/posts/"+slug+"/replies", `{"body_md":"hi"}`); rec.Code != 401 {
		t.Fatalf("anon reply → %d", rec.Code)
	}
	// 两条顶层回复 → floor 1、2
	r1 := send(guest, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"第一层"}`)
	if r1.Code != 201 || !strings.Contains(r1.Body.String(), `"floor":1`) {
		t.Fatalf("reply1 → %d %s", r1.Code, r1.Body)
	}
	r1id := extractID(t, r1.Body.String())
	r2 := send(author, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"第二层"}`)
	if r2.Code != 201 || !strings.Contains(r2.Body.String(), `"floor":2`) {
		t.Fatalf("reply2 → %d %s", r2.Code, r2.Body)
	}
	// 子回复：floor 0，parent 指向 r1
	c1 := send(author, "POST", "/api/posts/"+slug+"/replies",
		`{"body_md":"回复第一层","parent_id":"`+r1id+`"}`)
	if c1.Code != 201 || !strings.Contains(c1.Body.String(), `"floor":0`) ||
		!strings.Contains(c1.Body.String(), `"parent_id":"`+r1id+`"`) {
		t.Fatalf("child → %d %s", c1.Code, c1.Body)
	}
	c1id := extractID(t, c1.Body.String())
	// 对子回复再回复 → 400
	if rec := send(guest, "POST", "/api/posts/"+slug+"/replies",
		`{"body_md":"三级","parent_id":"`+c1id+`"}`); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "nesting_too_deep") {
		t.Fatalf("3rd level → %d %s", rec.Code, rec.Body)
	}
	// parent 属于别的帖子 → 400
	pr2 := send(author, "POST", "/api/posts", `{"type":"discuss","title":"other post","body_md":"b"}`)
	slug2 := extractSlug(t, pr2.Body.String())
	if rec := send(guest, "POST", "/api/posts/"+slug2+"/replies",
		`{"body_md":"x","parent_id":"`+r1id+`"}`); rec.Code != 400 {
		t.Errorf("cross-post parent → %d %s", rec.Code, rec.Body)
	}

	// 列表：两层结构，children 挂在 r1 下
	list := send("", "GET", "/api/posts/"+slug+"/replies", "")
	if list.Code != 200 {
		t.Fatalf("list → %d %s", list.Code, list.Body)
	}
	if !strings.Contains(list.Body.String(), `"children":[`) ||
		strings.Count(list.Body.String(), `"floor":`) != 3 {
		t.Errorf("list shape: %s", list.Body)
	}
	// 帖子 reply_count 计入全部回复（含子回复）
	pg := send("", "GET", "/api/posts/"+slug, "")
	if !strings.Contains(pg.Body.String(), `"reply_count":3`) {
		t.Errorf("reply_count: %s", pg.Body)
	}

	// 删除：他人不可删，作者可删
	if rec := send(guest, "DELETE", "/api/replies/"+c1id, ""); rec.Code != 403 {
		t.Errorf("other delete → %d", rec.Code)
	}
	if rec := send(author, "DELETE", "/api/replies/"+c1id, ""); rec.Code != 204 {
		t.Errorf("author delete → %d %s", rec.Code, rec.Body)
	}
	after := send("", "GET", "/api/posts/"+slug, "")
	if !strings.Contains(after.Body.String(), `"reply_count":2`) {
		t.Errorf("reply_count after delete: %s", after.Body)
	}
}

// TestListRepliesBatchAuthors 建 5 条顶层回复各带 1 条子回复（共 10 条），断言列表结构正确
// 且每条的 author.handle 与它真正的作者一致。这是为了给「把逐条 authorJSON 查询换成一次批量
// select ... where id = any($1) 再在内存里拼装」的改动兜底——批量组装最容易出的错就是张冠李戴
// （把 A 的回复配上 B 的作者信息）。5 个用户按 i → users[i]（顶层）/ users[(i+1)%5]（子回复）
// 错位配对，使同一条 top/child 的作者互不相同、且每个用户在列表里同时以「某条 top 的作者」和
// 「另一条 child 的作者」两种身份出现，足以在张冠李戴时必现，同时把注册数控制在认证限流的
// 突发上限（10 次/分钟）以内，不必为每条回复单独注册一个新用户。
func TestListRepliesBatchAuthors(t *testing.T) {
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
	const n = 5
	handles := make([]string, n)
	cookies := make([]string, n)
	for i := 0; i < n; i++ {
		handles[i] = fmt.Sprintf("batchuser%d", i)
		cookies[i] = mkUser(handles[i], fmt.Sprintf("bu%d@dev.cx", i))
	}
	pr := send(cookies[0], "POST", "/api/posts", `{"type":"discuss","title":"batch author test","body_md":"b"}`)
	slug := extractSlug(t, pr.Body.String())

	type wantPair struct{ top, child string }
	var want []wantPair
	for i := 0; i < n; i++ {
		childIdx := (i + 1) % n
		r := send(cookies[i], "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"top reply %d"}`, i))
		if r.Code != 201 {
			t.Fatalf("top reply %d → %d %s", i, r.Code, r.Body)
		}
		topID := extractID(t, r.Body.String())
		c := send(cookies[childIdx], "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"child reply %d","parent_id":"%s"}`, i, topID))
		if c.Code != 201 {
			t.Fatalf("child reply %d → %d %s", i, c.Code, c.Body)
		}
		want = append(want, wantPair{handles[i], handles[childIdx]})
	}

	list := send("", "GET", "/api/posts/"+slug+"/replies", "")
	if list.Code != 200 {
		t.Fatalf("list → %d %s", list.Code, list.Body)
	}
	var parsed struct {
		Replies []struct {
			BodyMD string `json:"body_md"`
			Author struct {
				Handle string `json:"handle"`
			} `json:"author"`
			Children []struct {
				BodyMD string `json:"body_md"`
				Author struct {
					Handle string `json:"handle"`
				} `json:"author"`
			} `json:"children"`
		} `json:"replies"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v; body=%s", err, list.Body)
	}
	if len(parsed.Replies) != 5 {
		t.Fatalf("top-level count = %d, want 5: %s", len(parsed.Replies), list.Body)
	}
	for i, top := range parsed.Replies {
		if top.Author.Handle != want[i].top {
			t.Errorf("top %d (%q) author = %q, want %q", i, top.BodyMD, top.Author.Handle, want[i].top)
		}
		if len(top.Children) != 1 {
			t.Fatalf("top %d (%q) children count = %d, want 1", i, top.BodyMD, len(top.Children))
		}
		if got := top.Children[0].Author.Handle; got != want[i].child {
			t.Errorf("child of top %d (%q) author = %q, want %q", i, top.BodyMD, got, want[i].child)
		}
	}
}

// TestListRepliesTopLevelNotStarvedByChildren 是对回归的直接复现：handleListReplies
// 原先用一条 `order by floor, created_at limit 200` 查询同时取顶层和子回复，但子回复的
// floor 恒为 0（只有顶层才取 max(floor)+1），于是排序把全部子回复排到全部顶层之前。挂
// 200 条子回复在一条顶层下，就足以让 limit 被子回复吃满，其余顶层（含它们各自的子树）
// 被挤出结果集之外——而响应只由 parent_id 为 null 的行组装，于是整个回复区从 API 消失。
// 这里建 3 条顶层回复，给第一条挂 200 条子回复，断言仍能拿到全部 3 条顶层；第一条的
// children 数按 maxChildRepliesPerParent 截断为 100（见 TestListRepliesChildCapTruncatesPerParent
// 对这个截断本身的专门覆盖），另两条 children 为空数组。
func TestListRepliesTopLevelNotStarvedByChildren(t *testing.T) {
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
	author := mkUser("starveauthor", "starve@dev.cx")

	pr := send(author, "POST", "/api/posts", `{"type":"discuss","title":"starvation test","body_md":"b"}`)
	slug := extractSlug(t, pr.Body.String())

	var topIDs []string
	for i := 0; i < 3; i++ {
		r := send(author, "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"top reply %d"}`, i))
		if r.Code != 201 {
			t.Fatalf("top reply %d → %d %s", i, r.Code, r.Body)
		}
		topIDs = append(topIDs, extractID(t, r.Body.String()))
	}
	const childCount = 200
	for i := 0; i < childCount; i++ {
		c := send(author, "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"child %d","parent_id":"%s"}`, i, topIDs[0]))
		if c.Code != 201 {
			t.Fatalf("child reply %d → %d %s", i, c.Code, c.Body)
		}
	}

	list := send("", "GET", "/api/posts/"+slug+"/replies", "")
	if list.Code != 200 {
		t.Fatalf("list → %d %s", list.Code, list.Body)
	}
	var parsed struct {
		Replies []struct {
			BodyMD   string            `json:"body_md"`
			Children []json.RawMessage `json:"children"`
		} `json:"replies"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v; body length=%d", err, list.Body.Len())
	}
	if len(parsed.Replies) != 3 {
		t.Fatalf("top-level count = %d, want 3 (starvation regression: children pushed tops out); body length=%d",
			len(parsed.Replies), list.Body.Len())
	}
	// 200 条子回复超过 maxChildRepliesPerParent（100），所以第一条顶层的 children
	// 被截断在 100——这是新加的按 parent 分区限量，不是本测试要复现的 starvation
	// 回归本身（starvation 回归的标志是「顶层数 != 3」，上面已经断言过了）。
	const wantCappedChildren = 100
	if len(parsed.Replies[0].Children) != wantCappedChildren {
		t.Errorf("top 0 children count = %d, want %d (capped)", len(parsed.Replies[0].Children), wantCappedChildren)
	}
	if len(parsed.Replies[1].Children) != 0 {
		t.Errorf("top 1 children count = %d, want 0", len(parsed.Replies[1].Children))
	}
	if len(parsed.Replies[2].Children) != 0 {
		t.Errorf("top 2 children count = %d, want 0", len(parsed.Replies[2].Children))
	}
}

// TestListRepliesChildCapTruncatesPerParent 覆盖场景 (a)：单条顶层挂 150 条子回复，
// 超过 maxChildRepliesPerParent（100），断言该顶层的 children 恰好截断到 100 条。
// 子回复查询不能不设上限——否则重新打开「回复列表无上限」问题的子回复维度（响应体
// 随子回复数无界增长，写端点又没有限流）。
func TestListRepliesChildCapTruncatesPerParent(t *testing.T) {
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
	author := mkUser("capauthor", "cap@dev.cx")

	pr := send(author, "POST", "/api/posts", `{"type":"discuss","title":"child cap test","body_md":"b"}`)
	slug := extractSlug(t, pr.Body.String())

	r := send(author, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"the only top"}`)
	if r.Code != 201 {
		t.Fatalf("top reply → %d %s", r.Code, r.Body)
	}
	topID := extractID(t, r.Body.String())

	const childCount = 150
	for i := 0; i < childCount; i++ {
		c := send(author, "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"child %d","parent_id":"%s"}`, i, topID))
		if c.Code != 201 {
			t.Fatalf("child reply %d → %d %s", i, c.Code, c.Body)
		}
	}

	list := send("", "GET", "/api/posts/"+slug+"/replies", "")
	if list.Code != 200 {
		t.Fatalf("list → %d %s", list.Code, list.Body)
	}
	var parsed struct {
		Replies []struct {
			Children []json.RawMessage `json:"children"`
		} `json:"replies"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v; body length=%d", err, list.Body.Len())
	}
	if len(parsed.Replies) != 1 {
		t.Fatalf("top-level count = %d, want 1", len(parsed.Replies))
	}
	const wantCappedChildren = 100
	if len(parsed.Replies[0].Children) != wantCappedChildren {
		t.Errorf("children count = %d, want %d (capped from %d)",
			len(parsed.Replies[0].Children), wantCappedChildren, childCount)
	}
}

// TestListRepliesChildCapDoesNotStarveOtherParents 覆盖场景 (b)：两条顶层，第一条挂 150
// 条子回复（超过 maxChildRepliesPerParent），第二条只挂 3 条。断言第一条的 children 截断
// 到 100，且第二条的 children 仍是完整的 3 条——证明按 parent 分区限量不会跨 parent 抢
// 名额。这是本次修法（用 row_number() over (partition by parent_id ...) 而不是给整个子
// 回复查询套一个笼统 limit）要保证的关键性质：一个整体 limit 会让 created_at 更早的那个
// parent 的子回复挤占配额，把另一个 parent 的子回复挤没——和已修的顶层被挤没是同一种缺陷。
func TestListRepliesChildCapDoesNotStarveOtherParents(t *testing.T) {
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
	author := mkUser("crosscapauthor", "crosscap@dev.cx")

	pr := send(author, "POST", "/api/posts", `{"type":"discuss","title":"cross parent cap test","body_md":"b"}`)
	slug := extractSlug(t, pr.Body.String())

	r1 := send(author, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"heavy top"}`)
	if r1.Code != 201 {
		t.Fatalf("top1 → %d %s", r1.Code, r1.Body)
	}
	top1ID := extractID(t, r1.Body.String())
	r2 := send(author, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"light top"}`)
	if r2.Code != 201 {
		t.Fatalf("top2 → %d %s", r2.Code, r2.Body)
	}
	top2ID := extractID(t, r2.Body.String())

	const heavyCount = 150
	for i := 0; i < heavyCount; i++ {
		c := send(author, "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"heavy child %d","parent_id":"%s"}`, i, top1ID))
		if c.Code != 201 {
			t.Fatalf("heavy child %d → %d %s", i, c.Code, c.Body)
		}
	}
	const lightCount = 3
	for i := 0; i < lightCount; i++ {
		c := send(author, "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"light child %d","parent_id":"%s"}`, i, top2ID))
		if c.Code != 201 {
			t.Fatalf("light child %d → %d %s", i, c.Code, c.Body)
		}
	}

	list := send("", "GET", "/api/posts/"+slug+"/replies", "")
	if list.Code != 200 {
		t.Fatalf("list → %d %s", list.Code, list.Body)
	}
	var parsed struct {
		Replies []struct {
			BodyMD   string            `json:"body_md"`
			Children []json.RawMessage `json:"children"`
		} `json:"replies"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v; body length=%d", err, list.Body.Len())
	}
	if len(parsed.Replies) != 2 {
		t.Fatalf("top-level count = %d, want 2", len(parsed.Replies))
	}
	// floor 顺序：heavy top 先建 → floor 1，light top 后建 → floor 2，列表按 floor 升序。
	heavy, light := parsed.Replies[0], parsed.Replies[1]
	const wantCappedChildren = 100
	if len(heavy.Children) != wantCappedChildren {
		t.Errorf("heavy top (%q) children count = %d, want %d (capped from %d)",
			heavy.BodyMD, len(heavy.Children), wantCappedChildren, heavyCount)
	}
	if len(light.Children) != lightCount {
		t.Errorf("light top (%q) children count = %d, want %d (must not be starved by heavy top's cap)",
			light.BodyMD, len(light.Children), lightCount)
	}
}
