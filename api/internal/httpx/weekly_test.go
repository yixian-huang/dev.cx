package httpx_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestWeeklyUnpublishedAndShape(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	send := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", path, nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	// 无任何期
	if rec := send("/api/weekly/latest"); rec.Code != 404 {
		t.Fatalf("empty latest → %d, want 404", rec.Code)
	}

	// 未发布草稿 → 404
	if _, err := pool.Exec(context.Background(),
		`insert into weekly_issues (year, week, title, editor_note_md)
		 values (2026, 10, 'Draft', 'note')`); err != nil {
		t.Fatal(err)
	}
	if rec := send("/api/weekly/2026/10"); rec.Code != 404 {
		t.Fatalf("draft issue → %d, want 404", rec.Code)
	}
	if rec := send("/api/weekly/latest"); rec.Code != 404 {
		t.Fatalf("latest with only draft → %d, want 404", rec.Code)
	}

	// 直接 SQL 插一期已发布
	hl := `[{"kind":"project","slug":"x","title":"X","deck":"d","author_handle":"a","reply_count":2}]`
	if _, err := pool.Exec(context.Background(),
		`insert into weekly_issues (year, week, title, editor_note_md, highlights, published_at)
		 values (2026, 11, 'Live', 'hello', $1::jsonb, now())`, hl); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{"/api/weekly/latest", "/api/weekly/2026/11"} {
		rec := send(path)
		if rec.Code != 200 {
			t.Fatalf("%s → %d %s", path, rec.Code, rec.Body)
		}
		var env struct {
			Year         int               `json:"year"`
			Week         int               `json:"week"`
			Title        string            `json:"title"`
			Note         string            `json:"editor_note_md"`
			Highlights   []map[string]any  `json:"highlights"`
			PublishedAt  string            `json:"published_at"`
			Prev         any               `json:"prev"`
			Next         any               `json:"next"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
			t.Fatalf("%s decode: %v", path, err)
		}
		if env.Year != 2026 || env.Week != 11 || env.Title != "Live" || env.Note != "hello" {
			t.Errorf("%s meta: %+v", path, env)
		}
		if len(env.Highlights) != 1 || env.Highlights[0]["kind"] != "project" {
			t.Errorf("%s highlights: %v", path, env.Highlights)
		}
		if env.PublishedAt == "" {
			t.Errorf("%s missing published_at", path)
		}
		if env.Prev != nil || env.Next != nil {
			t.Errorf("%s prev/next want null: prev=%v next=%v", path, env.Prev, env.Next)
		}
	}
}

func TestAssembleHighlights(t *testing.T) {
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

	owner := mkUser("wkowner", "wkowner@dev.cx")
	replier := mkUser("wkreply", "wkreply@dev.cx")

	if rec := send(owner, "POST", "/api/projects",
		`{"slug":"wk-hot","name":"Hot Proj","tagline":"hot deck","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("project → %d %s", rec.Code, rec.Body)
	}
	// 帖 + 回复 → heat
	pr := send(owner, "POST", "/api/posts",
		`{"type":"show","project_slug":"wk-hot","title":"show post","body_md":"body of show"}`)
	if pr.Code != 201 {
		t.Fatalf("post → %d %s", pr.Code, pr.Body)
	}
	slug := extractSlug(t, pr.Body.String())
	for i := 0; i < 2; i++ {
		if rec := send(replier, "POST", "/api/posts/"+slug+"/replies",
			fmt.Sprintf(`{"body_md":"r%d"}`, i)); rec.Code != 201 {
			t.Fatalf("reply → %d %s", rec.Code, rec.Body)
		}
	}
	// 另一条讨论帖（同周）
	if rec := send(owner, "POST", "/api/posts",
		`{"type":"discuss","title":"week talk","body_md":"long body for deck truncation test which is fine"}`); rec.Code != 201 {
		t.Fatalf("discuss → %d %s", rec.Code, rec.Body)
	}

	y, w := time.Now().ISOWeek()
	hs, err := httpx.AssembleHighlights(context.Background(), pool, y, w)
	if err != nil {
		t.Fatalf("assemble: %v", err)
	}
	if len(hs) == 0 || len(hs) > 8 {
		t.Fatalf("len(highlights)=%d, want 1..8", len(hs))
	}
	// project 在前
	if hs[0].Kind != "project" {
		t.Fatalf("first kind = %s, want project", hs[0].Kind)
	}
	foundProj, foundPost := false, false
	for _, h := range hs {
		switch h.Kind {
		case "project":
			foundProj = true
			if h.Slug == "wk-hot" {
				if h.Title != "Hot Proj" || h.Deck != "hot deck" || h.AuthorHandle != "wkowner" {
					t.Errorf("project fields: %+v", h)
				}
				if h.ReplyCount != 2 {
					t.Errorf("project heat = %d, want 2", h.ReplyCount)
				}
			}
		case "post":
			foundPost = true
			if h.Slug == "" || h.Title == "" || h.AuthorHandle == "" {
				t.Errorf("post fields incomplete: %+v", h)
			}
		default:
			t.Errorf("bad kind %q", h.Kind)
		}
	}
	if !foundProj || !foundPost {
		t.Fatalf("want both project and post highlights, got %#v", hs)
	}
}

func TestWeeklySnapshotAndNav(t *testing.T) {
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
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", path, nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	owner := mkUser("snapowner", "snapowner@dev.cx")
	replier := mkUser("snapreply", "snapreply@dev.cx")
	if rec := send(owner, "POST", "/api/projects",
		`{"slug":"snap-p","name":"Snap","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("project → %d", rec.Code)
	}
	pr := send(owner, "POST", "/api/posts",
		`{"type":"show","project_slug":"snap-p","title":"snap show","body_md":"b"}`)
	slug := extractSlug(t, pr.Body.String())
	if rec := send(replier, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"one"}`); rec.Code != 201 {
		t.Fatalf("reply → %d", rec.Code)
	}

	y, w := time.Now().ISOWeek()
	hs, err := httpx.AssembleHighlights(context.Background(), pool, y, w)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(hs)
	// 发布当前周
	if _, err := pool.Exec(context.Background(),
		`insert into weekly_issues (year, week, title, editor_note_md, highlights, published_at)
		 values ($1,$2,'Snap Week','', $3::jsonb, now())`, y, w, raw); err != nil {
		t.Fatal(err)
	}

	// 记下快照中 project heat
	var snapHeat int
	for _, h := range hs {
		if h.Kind == "project" && h.Slug == "snap-p" {
			snapHeat = h.ReplyCount
		}
	}
	if snapHeat != 1 {
		t.Fatalf("pre-snapshot heat = %d, want 1", snapHeat)
	}

	// 发布后再加回复
	if rec := send(replier, "POST", "/api/posts/"+slug+"/replies", `{"body_md":"two"}`); rec.Code != 201 {
		t.Fatalf("extra reply → %d", rec.Code)
	}

	// GET highlights 不变
	rec := get(fmt.Sprintf("/api/weekly/%d/%d", y, w))
	if rec.Code != 200 {
		t.Fatalf("get issue → %d %s", rec.Code, rec.Body)
	}
	var env struct {
		Highlights []struct {
			Kind       string `json:"kind"`
			Slug       string `json:"slug"`
			ReplyCount int    `json:"reply_count"`
		} `json:"highlights"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	for _, h := range env.Highlights {
		if h.Kind == "project" && h.Slug == "snap-p" && h.ReplyCount != snapHeat {
			t.Fatalf("snapshot drifted: reply_count=%d want %d", h.ReplyCount, snapHeat)
		}
	}

	// prev/next：三期两发布（中间草稿被跳过）
	// 用远离当前周的固定期号，避免与上面当前周冲突
	for _, row := range []struct {
		year, week int
		title      string
		pub        bool
	}{
		{2090, 1, "A", true},
		{2090, 2, "B-draft", false},
		{2090, 3, "C", true},
	} {
		if row.pub {
			if _, err := pool.Exec(context.Background(),
				`insert into weekly_issues (year, week, title, highlights, published_at)
				 values ($1,$2,$3,'[]'::jsonb, now())`,
				row.year, row.week, row.title); err != nil {
				t.Fatal(err)
			}
		} else {
			if _, err := pool.Exec(context.Background(),
				`insert into weekly_issues (year, week, title)
				 values ($1,$2,$3)`,
				row.year, row.week, row.title); err != nil {
				t.Fatal(err)
			}
		}
	}

	// 中间草稿对外 404
	if rec := get("/api/weekly/2090/2"); rec.Code != 404 {
		t.Fatalf("draft mid → %d", rec.Code)
	}

	// week 1: next 跳过草稿到 3（prev 可能指向更早的已发布期，不在此断言 null）
	r1 := get("/api/weekly/2090/1")
	if r1.Code != 200 {
		t.Fatalf("week1 → %d %s", r1.Code, r1.Body)
	}
	if !strings.Contains(r1.Body.String(), `"next":{"year":2090,"week":3}`) {
		t.Errorf("week1 next: %s", r1.Body)
	}

	// week 3: prev 跳过草稿到 1；next 应 null（2090-W3 是最远一期）
	r3 := get("/api/weekly/2090/3")
	if r3.Code != 200 {
		t.Fatalf("week3 → %d %s", r3.Code, r3.Body)
	}
	if !strings.Contains(r3.Body.String(), `"prev":{"year":2090,"week":1}`) {
		t.Errorf("week3 prev: %s", r3.Body)
	}
	if !strings.Contains(r3.Body.String(), `"next":null`) {
		t.Errorf("week3 next want null: %s", r3.Body)
	}

	// latest 取最大已发布（当前周 y/w 可能大于 2090-W3，取决于今天）
	// 再插一期更大的确保 latest 可测，或断言 latest 是已发布的某一期
	latest := get("/api/weekly/latest")
	if latest.Code != 200 {
		t.Fatalf("latest → %d %s", latest.Code, latest.Body)
	}
	if strings.Contains(latest.Body.String(), `"title":"B-draft"`) {
		t.Error("latest must not be draft")
	}
}
