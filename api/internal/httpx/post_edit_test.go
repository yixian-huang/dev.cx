package httpx_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestPublishedEditWindowAndReplies(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 2, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"ed@dev.cx","password":"pw123456","handle":"editor1","display_name":"E"}`)
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='editor1'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}

	rec := send("POST", "/api/posts",
		`{"type":"discuss","title":"hello edit","body_md":"v1","status":"published"}`)
	if rec.Code != 201 {
		t.Fatalf("create → %d %s", rec.Code, rec.Body)
	}
	slug := extractSlug(t, rec.Body.String())
	if !strings.Contains(rec.Body.String(), `"can_edit":true`) {
		// create response includes can_edit for author
		t.Fatalf("want can_edit true: %s", rec.Body)
	}

	// 窗内可编
	patch := send("PATCH", "/api/posts/"+slug, `{"body_md":"v2"}`)
	if patch.Code != 200 {
		t.Fatalf("patch in window → %d %s", patch.Code, patch.Body)
	}
	if !strings.Contains(patch.Body.String(), `"edited":true`) {
		t.Fatalf("want edited true: %s", patch.Body)
	}

	// 他人回复后禁编
	reg2 := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[1]+`","email":"rp@dev.cx","password":"pw123456","handle":"replier","display_name":"R"}`)
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='replier'`)
	ck2 := strings.Split(reg2.Header().Get("Set-Cookie"), ";")[0]
	req := httptest.NewRequest("POST", "/api/posts/"+slug+"/replies",
		strings.NewReader(`{"body_md":"nice"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", ck2)
	rrec := httptest.NewRecorder()
	srv.ServeHTTP(rrec, req)
	if rrec.Code != 201 {
		t.Fatalf("reply → %d %s", rrec.Code, rrec.Body)
	}

	blocked := send("PATCH", "/api/posts/"+slug, `{"body_md":"v3"}`)
	if blocked.Code != 403 || !strings.Contains(blocked.Body.String(), "edit_has_replies") {
		t.Fatalf("after reply → %d %s", blocked.Code, blocked.Body)
	}
}

func TestEditWindowClosed(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"ew@dev.cx","password":"pw123456","handle":"oldedit","display_name":"O"}`)
	pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='oldedit'`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	rec := send("POST", "/api/posts",
		`{"type":"discuss","title":"old","body_md":"x","status":"published"}`)
	slug := extractSlug(t, rec.Body.String())
	// 把 published_at 拨回 31 分钟前
	_, err := pool.Exec(context.Background(),
		`update posts set published_at = $1, created_at = $1 where slug=$2`,
		time.Now().UTC().Add(-31*time.Minute), slug)
	if err != nil {
		t.Fatal(err)
	}
	closed := send("PATCH", "/api/posts/"+slug, `{"body_md":"too late"}`)
	if closed.Code != 403 || !strings.Contains(closed.Body.String(), "edit_window_closed") {
		t.Fatalf("window closed → %d %s", closed.Code, closed.Body)
	}
}
