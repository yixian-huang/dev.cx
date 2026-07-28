package httpx_test

import (
	"context"
	"encoding/json"
	"fmt"
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

func TestListProjects(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"lister@dev.cx","password":"pw123456","handle":"lister","display_name":"Lister"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='lister'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	for i := 0; i < 3; i++ {
		body := fmt.Sprintf(`{"slug":"proj-%d","name":"Proj %d","tagline":"t","stage":"wip"}`, i, i)
		if rec := send("POST", "/api/projects", body); rec.Code != 201 {
			t.Fatalf("create proj-%d → %d %s", i, rec.Code, rec.Body)
		}
	}

	// 匿名可读全站列表
	lrec := send("GET", "/api/projects", "")
	if lrec.Code != 200 {
		t.Fatalf("list → %d %s", lrec.Code, lrec.Body)
	}
	var out struct {
		Projects   []map[string]any `json:"projects"`
		NextCursor any              `json:"next_cursor"`
	}
	if err := json.Unmarshal(lrec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Projects) != 3 {
		t.Fatalf("want 3 projects, got %d", len(out.Projects))
	}
	// 最新的在前
	if out.Projects[0]["slug"] != "proj-2" {
		t.Fatalf("order wrong: first = %v", out.Projects[0]["slug"])
	}
	// 列表不带 stats
	if _, has := out.Projects[0]["stats"]; has {
		t.Fatal("list must not include stats")
	}
}

func TestListProjectsPagination(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"pager@dev.cx","password":"pw123456","handle":"pager","display_name":"Pager"}`)
	if reg.Code != 201 {
		t.Fatalf("register → %d %s", reg.Code, reg.Body)
	}
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='pager'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	for i := 0; i < 5; i++ {
		body := fmt.Sprintf(`{"slug":"pg-%d","name":"PG %d","tagline":"t","stage":"wip"}`, i, i)
		if rec := send("POST", "/api/projects", body); rec.Code != 201 {
			t.Fatalf("create pg-%d → %d %s", i, rec.Code, rec.Body)
		}
	}

	var out struct {
		Projects   []map[string]any `json:"projects"`
		NextCursor *string          `json:"next_cursor"`
	}
	get := func(path string) {
		rec := send("GET", path, "")
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
	}
	get("/api/projects?limit=2")
	if len(out.Projects) != 2 || out.NextCursor == nil {
		t.Fatalf("page1: len=%d cursor=%v", len(out.Projects), out.NextCursor)
	}
	first := out.Projects[0]["slug"]
	get("/api/projects?limit=2&cursor=" + url.QueryEscape(*out.NextCursor))
	if len(out.Projects) != 2 || out.Projects[0]["slug"] == first {
		t.Fatal("page2 wrong or repeated")
	}

	// bad cursor → 400
	res := send("GET", "/api/projects?cursor=garbage", "")
	if res.Code != http.StatusBadRequest {
		t.Fatalf("bad cursor: status = %d", res.Code)
	}
}

func TestListProjectsTrendingAndAgg(t *testing.T) {
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

	owner := mkUser("trendowner", "trendowner@dev.cx")
	replier := mkUser("trendreply", "trendreply@dev.cx")

	// A 先建、B 后建：默认 created_at 序 B 在前；trending 时 A（有回复）应在前
	if rec := send(owner, "POST", "/api/projects",
		`{"slug":"trend-a","name":"Trend A","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("create A → %d %s", rec.Code, rec.Body)
	}
	if rec := send(owner, "POST", "/api/projects",
		`{"slug":"trend-b","name":"Trend B","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("create B → %d %s", rec.Code, rec.Body)
	}

	// A：一条 ask 帖带 feedback_wanted，再 3 条回复 → heat=3
	pr := send(owner, "POST", "/api/posts",
		`{"type":"ask","project_slug":"trend-a","title":"need feedback","body_md":"help",
		  "feedback_wanted":["ux"]}`)
	if pr.Code != 201 {
		t.Fatalf("create post A → %d %s", pr.Code, pr.Body)
	}
	slugA := extractSlug(t, pr.Body.String())
	for i := 0; i < 3; i++ {
		if rec := send(replier, "POST", "/api/posts/"+slugA+"/replies",
			fmt.Sprintf(`{"body_md":"reply %d"}`, i)); rec.Code != 201 {
			t.Fatalf("reply %d → %d %s", i, rec.Code, rec.Body)
		}
	}

	// sort=trending：A 在前，reply_count_7d=3；next_cursor null
	trec := send("", "GET", "/api/projects?sort=trending", "")
	if trec.Code != 200 {
		t.Fatalf("trending → %d %s", trec.Code, trec.Body)
	}
	var tout struct {
		Projects   []map[string]any `json:"projects"`
		NextCursor any              `json:"next_cursor"`
	}
	if err := json.Unmarshal(trec.Body.Bytes(), &tout); err != nil {
		t.Fatal(err)
	}
	if tout.NextCursor != nil {
		t.Fatalf("trending next_cursor want null, got %v", tout.NextCursor)
	}
	if len(tout.Projects) < 2 {
		t.Fatalf("want >=2 projects, got %d", len(tout.Projects))
	}
	if tout.Projects[0]["slug"] != "trend-a" {
		t.Fatalf("trending first = %v, want trend-a", tout.Projects[0]["slug"])
	}
	// JSON numbers decode as float64
	if rc, ok := tout.Projects[0]["reply_count_7d"].(float64); !ok || int(rc) != 3 {
		t.Fatalf("reply_count_7d = %v, want 3", tout.Projects[0]["reply_count_7d"])
	}
	if hb, ok := tout.Projects[0]["has_feedback_request"].(bool); !ok || !hb {
		t.Fatalf("has_feedback_request = %v, want true", tout.Projects[0]["has_feedback_request"])
	}
	lp, ok := tout.Projects[0]["latest_post"].(map[string]any)
	if !ok || lp == nil {
		t.Fatalf("latest_post missing: %v", tout.Projects[0]["latest_post"])
	}
	if lp["slug"] != slugA || lp["title"] != "need feedback" {
		t.Fatalf("latest_post shape: %v", lp)
	}
	if rc, ok := lp["reply_count"].(float64); !ok || int(rc) != 3 {
		t.Fatalf("latest_post.reply_count = %v, want 3", lp["reply_count"])
	}

	// B：无帖 → heat 0、latest_post null、has_feedback_request false
	var bRow map[string]any
	for _, p := range tout.Projects {
		if p["slug"] == "trend-b" {
			bRow = p
			break
		}
	}
	if bRow == nil {
		t.Fatal("trend-b missing from list")
	}
	if rc, ok := bRow["reply_count_7d"].(float64); !ok || int(rc) != 0 {
		t.Fatalf("B reply_count_7d = %v, want 0", bRow["reply_count_7d"])
	}
	if hb, ok := bRow["has_feedback_request"].(bool); !ok || hb {
		t.Fatalf("B has_feedback_request = %v, want false", bRow["has_feedback_request"])
	}
	if bRow["latest_post"] != nil {
		t.Fatalf("B latest_post = %v, want null", bRow["latest_post"])
	}

	// 用户列表同样带聚合键
	ulist := send("", "GET", "/api/users/trendowner/projects", "")
	if ulist.Code != 200 || !strings.Contains(ulist.Body.String(), `"reply_count_7d"`) {
		t.Fatalf("user list missing agg: %d %s", ulist.Code, ulist.Body)
	}

	// 默认排序仍是 created_at desc（B 后建在前）；详情不含三键
	def := send("", "GET", "/api/projects", "")
	var dout struct {
		Projects []map[string]any `json:"projects"`
	}
	_ = json.Unmarshal(def.Body.Bytes(), &dout)
	if len(dout.Projects) < 2 || dout.Projects[0]["slug"] != "trend-b" {
		t.Fatalf("default order first = %v, want trend-b", dout.Projects[0]["slug"])
	}
	detail := send("", "GET", "/api/projects/trend-a", "")
	if strings.Contains(detail.Body.String(), "reply_count_7d") ||
		strings.Contains(detail.Body.String(), "has_feedback_request") ||
		strings.Contains(detail.Body.String(), "latest_post") {
		t.Errorf("detail must not include list agg keys: %s", detail.Body)
	}
}
