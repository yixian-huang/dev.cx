package httpx_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestStatsEndpoint(t *testing.T) {
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

	a := mkUser("statu1", "statu1@dev.cx")
	b := mkUser("statu2", "statu2@dev.cx")

	// 3 项目
	for _, slug := range []string{"sp1", "sp2", "sp3"} {
		if rec := send(a, "POST", "/api/projects",
			`{"slug":"`+slug+`","name":"`+slug+`","tagline":"t","stage":"wip"}`); rec.Code != 201 {
			t.Fatalf("create %s → %d %s", slug, rec.Code, rec.Body)
		}
	}

	// 2 帖：target + dup，再合并 → 未合并帖数 = 1
	target := extractSlug(t, send(a, "POST", "/api/posts",
		`{"type":"discuss","title":"stats target","body_md":"b"}`).Body.String())
	dup := extractSlug(t, send(b, "POST", "/api/posts",
		`{"type":"discuss","title":"stats dup","body_md":"b"}`).Body.String())
	if rec := send(a, "POST", "/api/posts/"+dup+"/merge", `{"into":"`+target+`"}`); rec.Code != 200 {
		t.Fatalf("merge → %d %s", rec.Code, rec.Body)
	}

	// 匿名可访问
	rec := send("", "GET", "/api/stats", "")
	if rec.Code != 200 {
		t.Fatalf("stats → %d %s", rec.Code, rec.Body)
	}
	var st struct {
		Builders     int `json:"builders"`
		Products     int `json:"products"`
		Discussions  int `json:"discussions"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
		t.Fatal(err)
	}
	if st.Builders != 2 || st.Products != 3 || st.Discussions != 1 {
		t.Fatalf("stats = %+v, want builders=2 products=3 discussions=1", st)
	}
}
