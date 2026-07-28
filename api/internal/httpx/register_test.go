package httpx_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func postJSON(t *testing.T, h http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRegister(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")

	rec := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"new@dev.cx","password":"pw123456","handle":"newbie","display_name":"Newbie"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d body %s", rec.Code, rec.Body)
	}
	if !strings.Contains(rec.Header().Get("Set-Cookie"), "devcx_session=") {
		t.Fatal("session cookie not set")
	}

	cases := []struct {
		body, wantErr string
		wantCode      int
	}{
		{`{"invite_code":"bad","email":"x@dev.cx","password":"pw123456","handle":"xx1","display_name":"X"}`, "invite_invalid", 400},
		{`{"invite_code":"` + codes[0] + `","email":"y@dev.cx","password":"pw123456","handle":"yy1","display_name":"Y"}`, "invite_invalid", 400}, // 已核销
		{`{"invite_code":"any","email":"short@dev.cx","password":"czh1994","handle":"shortpw","display_name":"S"}`, "password_too_short", 400},
		{`{"invite_code":"any","email":"","password":"pw123456","handle":"noemail","display_name":"N"}`, "email_required", 400},
		{`{"invite_code":"any","email":"noname@dev.cx","password":"pw123456","handle":"nondn","display_name":""}`, "display_name_required", 400},
	}
	for _, c := range cases {
		rec := postJSON(t, srv, "/api/auth/register", c.body)
		if rec.Code != c.wantCode || !strings.Contains(rec.Body.String(), c.wantErr) {
			t.Errorf("body %s → %d %s, want %d %s", c.body, rec.Code, rec.Body, c.wantCode, c.wantErr)
		}
	}
}

func TestRegisterHandleRules(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	mk := func() string {
		codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
		return codes[0]
	}
	for _, c := range []struct {
		handle, wantErr string
	}{
		{"about", "handle_reserved"},
		{"Bad Name", "handle_invalid"},
	} {
		rec := postJSON(t, srv, "/api/auth/register",
			`{"invite_code":"`+mk()+`","email":"`+c.handle+`@dev.cx","password":"pw123456","handle":"`+c.handle+`","display_name":"T"}`)
		if rec.Code != 400 || !strings.Contains(rec.Body.String(), c.wantErr) {
			t.Errorf("handle %q → %d %s, want %s", c.handle, rec.Code, rec.Body, c.wantErr)
		}
	}
}

func TestRegisterDisplayNameLength(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	mk := func() string {
		codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
		return codes[0]
	}

	// Test display_name at exactly maxDisplayNameLen characters (using Chinese characters)
	// to ensure we're counting characters, not bytes.
	// maxDisplayNameLen is 64, so we use 64 Chinese characters.
	maxLen := 64
	exactLenName := strings.Repeat("中", maxLen) // 64 Chinese characters
	if utf8.RuneCountInString(exactLenName) != maxLen {
		t.Fatalf("test setup error: exactLenName has %d runes, want %d", utf8.RuneCountInString(exactLenName), maxLen)
	}

	rec := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+mk()+`","email":"exact@dev.cx","password":"pw123456","handle":"exact","display_name":"`+exactLenName+`"}`)
	if rec.Code != http.StatusCreated {
		t.Errorf("display_name with exactly %d chars → %d %s, want %d", maxLen, rec.Code, rec.Body, http.StatusCreated)
	}

	// Test display_name exceeding maxDisplayNameLen by 1 character.
	tooLongName := strings.Repeat("中", maxLen+1) // 65 Chinese characters
	if utf8.RuneCountInString(tooLongName) != maxLen+1 {
		t.Fatalf("test setup error: tooLongName has %d runes, want %d", utf8.RuneCountInString(tooLongName), maxLen+1)
	}

	rec = postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+mk()+`","email":"toolong@dev.cx","password":"pw123456","handle":"toolong","display_name":"`+tooLongName+`"}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "too_long") {
		t.Errorf("display_name with %d chars → %d %s, want 400 with too_long", maxLen+1, rec.Code, rec.Body)
	}
}

// TestMeEmailVisibility 断言本人语境响应含 email，公开 resolve 端点不含 email 键。
func TestMeEmailVisibility(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")

	const email = "emailvis@dev.cx"
	const handle = "emailvis"
	rec := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"`+email+`","password":"pw123456","handle":"`+handle+`","display_name":"EV"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register → %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(rec.Body.String(), `"email":"`+email+`"`) {
		t.Fatalf("register body missing email: %s", rec.Body)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/resolve/"+handle, nil)
	prec := httptest.NewRecorder()
	srv.ServeHTTP(prec, req)
	if prec.Code != 200 {
		t.Fatalf("resolve → %d %s", prec.Code, prec.Body)
	}
	if strings.Contains(prec.Body.String(), `"email"`) {
		t.Fatalf("public resolve must not include email key: %s", prec.Body)
	}
}
