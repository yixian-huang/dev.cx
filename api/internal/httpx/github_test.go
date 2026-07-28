package httpx_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

// fakeGitHub 返回 token 与固定 id=42/login=octo-dev 的 /user。id 是 GitHub 侧不可变的
// 身份标识，login 是可变用户名，登录/绑定必须按 id 匹配（见 TestGitHubLoginMatchesByIDNotByMutableLogin）。
func fakeGitHub(t *testing.T) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"access_token": "fake-token", "token_type": "bearer"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer fake-token" {
			w.WriteHeader(401)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"id": 42, "login": "octo-dev"})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestGitHubLinkThenLogin(t *testing.T) {
	pool := testutil.TestPool(t)
	gh := fakeGitHub(t)
	cfg := config.Load()
	cfg.GitHubClientID, cfg.GitHubClientSecret = "id", "secret"
	cfg.GitHubTokenURL, cfg.GitHubAPIURL = gh.URL+"/token", gh.URL
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: cfg})

	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"gh@dev.cx","password":"pw123456","handle":"ghuser","display_name":"G"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	// 绑定：登录态携带 state cookie 访问 callback
	start := httptest.NewRequest(http.MethodGet, "/api/auth/github?mode=link", nil)
	start.Header.Set("Cookie", cookie)
	srec := httptest.NewRecorder()
	srv.ServeHTTP(srec, start)
	if srec.Code != http.StatusFound {
		t.Fatalf("start → %d", srec.Code)
	}
	stateCookie := strings.Split(srec.Header().Get("Set-Cookie"), ";")[0]
	state := strings.SplitN(strings.SplitN(stateCookie, "=", 2)[1], ";", 2)[0]

	cb := httptest.NewRequest(http.MethodGet, "/api/auth/github/callback?code=x&state="+state, nil)
	cb.Header.Set("Cookie", cookie+"; "+stateCookie)
	crec := httptest.NewRecorder()
	srv.ServeHTTP(crec, cb)
	if crec.Code != http.StatusFound {
		t.Fatalf("callback → %d %s", crec.Code, crec.Body)
	}

	var verified bool
	var login string
	pool.QueryRow(context.Background(),
		`select github_verified, coalesce(github_login,'') from users where handle='ghuser'`).Scan(&verified, &login)
	if !verified || login != "octo-dev" {
		t.Fatalf("link failed: %v %q", verified, login)
	}

	// 已绑定登录：无会话走 mode=login
	start2 := httptest.NewRequest(http.MethodGet, "/api/auth/github?mode=login", nil)
	s2 := httptest.NewRecorder()
	srv.ServeHTTP(s2, start2)
	st2Cookie := strings.Split(s2.Header().Get("Set-Cookie"), ";")[0]
	st2 := strings.SplitN(strings.SplitN(st2Cookie, "=", 2)[1], ";", 2)[0]
	cb2 := httptest.NewRequest(http.MethodGet, "/api/auth/github/callback?code=x&state="+st2, nil)
	cb2.Header.Set("Cookie", st2Cookie)
	c2 := httptest.NewRecorder()
	srv.ServeHTTP(c2, cb2)
	if !strings.Contains(c2.Header().Get("Set-Cookie"), "devcx_session=") {
		t.Fatalf("github login did not create session: %d", c2.Code)
	}
}

// TestGitHubLinkStateBoundToInitiator 覆盖用 A 的 state 但带 B 的会话去回调的场景：
// state 必须绑定发起者身份，否则 GitHub 账号可能被绑到错误的用户上。
func TestGitHubLinkStateBoundToInitiator(t *testing.T) {
	pool := testutil.TestPool(t)
	gh := fakeGitHub(t)
	cfg := config.Load()
	cfg.GitHubClientID, cfg.GitHubClientSecret = "id", "secret"
	cfg.GitHubTokenURL, cfg.GitHubAPIURL = gh.URL+"/token", gh.URL
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: cfg})

	codesA, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	regA := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codesA[0]+`","email":"a@dev.cx","password":"pw123456","handle":"userA","display_name":"A"}`)
	cookieA := strings.Split(regA.Header().Get("Set-Cookie"), ";")[0]

	codesB, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	regB := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codesB[0]+`","email":"b@dev.cx","password":"pw123456","handle":"userB","display_name":"B"}`)
	cookieB := strings.Split(regB.Header().Get("Set-Cookie"), ";")[0]

	// A 发起 link，拿到绑定了 A 身份的 state。
	start := httptest.NewRequest(http.MethodGet, "/api/auth/github?mode=link", nil)
	start.Header.Set("Cookie", cookieA)
	srec := httptest.NewRecorder()
	srv.ServeHTTP(srec, start)
	if srec.Code != http.StatusFound {
		t.Fatalf("start → %d", srec.Code)
	}
	stateCookie := strings.Split(srec.Header().Get("Set-Cookie"), ";")[0]
	state := strings.SplitN(strings.SplitN(stateCookie, "=", 2)[1], ";", 2)[0]

	// 带 B 的会话去回调，state 与当前登录用户不一致，应拒绝。
	cb := httptest.NewRequest(http.MethodGet, "/api/auth/github/callback?code=x&state="+state, nil)
	cb.Header.Set("Cookie", cookieB+"; "+stateCookie)
	crec := httptest.NewRecorder()
	srv.ServeHTTP(crec, cb)
	if crec.Code != http.StatusBadRequest || !strings.Contains(crec.Body.String(), "bad_state") {
		t.Fatalf("cross-account callback → %d %s, want 400 bad_state", crec.Code, crec.Body)
	}

	var verified bool
	pool.QueryRow(context.Background(),
		`select github_verified from users where handle='userB'`).Scan(&verified)
	if verified {
		t.Fatal("userB must not have been linked by userA's state")
	}
}

// TestGitHubLoginMatchesByIDNotByMutableLogin 覆盖账号接管场景：GitHub 的 login
// （用户名）可变，原用户改名后旧用户名可能被他人注册；如果登录按 github_login 匹配，
// 一旦本地存的 github_login 与 GitHub 侧当前实际 login 不一致（无论出于什么原因——
// 比如尚未重新同步），账号就再也登不进去，或者更糟，被匹配到错误的账号。
// 正确实现应始终按不可变的 github_id 匹配。这里绑定后直接改写本地 github_login
// （模拟“GitHub 上改了名，我们这边的展示字段还没跟上”），再用同一个 fake GitHub
// 身份（id 不变）走 mode=login 回调，断言仍能登录回原账号。
func TestGitHubLoginMatchesByIDNotByMutableLogin(t *testing.T) {
	pool := testutil.TestPool(t)
	gh := fakeGitHub(t) // id=42, login=octo-dev
	cfg := config.Load()
	cfg.GitHubClientID, cfg.GitHubClientSecret = "id", "secret"
	cfg.GitHubTokenURL, cfg.GitHubAPIURL = gh.URL+"/token", gh.URL
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: cfg})

	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"rename@dev.cx","password":"pw123456","handle":"renameduser","display_name":"R"}`)
	cookie := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]

	start := httptest.NewRequest(http.MethodGet, "/api/auth/github?mode=link", nil)
	start.Header.Set("Cookie", cookie)
	srec := httptest.NewRecorder()
	srv.ServeHTTP(srec, start)
	stateCookie := strings.Split(srec.Header().Get("Set-Cookie"), ";")[0]
	state := strings.SplitN(strings.SplitN(stateCookie, "=", 2)[1], ";", 2)[0]

	cb := httptest.NewRequest(http.MethodGet, "/api/auth/github/callback?code=x&state="+state, nil)
	cb.Header.Set("Cookie", cookie+"; "+stateCookie)
	crec := httptest.NewRecorder()
	srv.ServeHTTP(crec, cb)
	if crec.Code != http.StatusFound {
		t.Fatalf("link callback → %d %s", crec.Code, crec.Body)
	}

	// 模拟 GitHub 改名：把本地存的 github_login 改成别的值，github_id 不动。
	if _, err := pool.Exec(context.Background(),
		`update users set github_login='someone-else-now' where handle='renameduser'`); err != nil {
		t.Fatalf("simulate rename: %v", err)
	}

	start2 := httptest.NewRequest(http.MethodGet, "/api/auth/github?mode=login", nil)
	s2 := httptest.NewRecorder()
	srv.ServeHTTP(s2, start2)
	st2Cookie := strings.Split(s2.Header().Get("Set-Cookie"), ";")[0]
	st2 := strings.SplitN(strings.SplitN(st2Cookie, "=", 2)[1], ";", 2)[0]
	cb2 := httptest.NewRequest(http.MethodGet, "/api/auth/github/callback?code=x&state="+st2, nil)
	cb2.Header.Set("Cookie", st2Cookie)
	c2 := httptest.NewRecorder()
	srv.ServeHTTP(c2, cb2)
	sessionCookie := c2.Header().Get("Set-Cookie")
	if !strings.Contains(sessionCookie, "devcx_session=") {
		t.Fatalf("github login (post-rename) did not create session: %d %s", c2.Code, c2.Body)
	}

	// 断言登进的是原账号（renameduser），而不是被 login 值意外匹配到别的账号或落空。
	meReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	meReq.Header.Set("Cookie", strings.Split(sessionCookie, ";")[0])
	meRec := httptest.NewRecorder()
	srv.ServeHTTP(meRec, meReq)
	if meRec.Code != 200 || !strings.Contains(meRec.Body.String(), `"handle":"renameduser"`) {
		t.Fatalf("post-rename login landed on wrong/no account: %d %s", meRec.Code, meRec.Body)
	}
}
