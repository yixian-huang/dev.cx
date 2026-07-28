package httpx_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/ids"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestLoginLogoutMe(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
	postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"l@dev.cx","password":"pw123456","handle":"loginme","display_name":"L"}`)

	rec := postJSON(t, srv, "/api/auth/login", `{"email":"l@dev.cx","password":"wrong-pass"}`)
	if rec.Code != 401 {
		t.Fatalf("wrong pw → %d", rec.Code)
	}

	rec = postJSON(t, srv, "/api/auth/login", `{"email":"l@dev.cx","password":"pw123456"}`)
	if rec.Code != 200 {
		t.Fatalf("login → %d %s", rec.Code, rec.Body)
	}
	cookie := rec.Header().Get("Set-Cookie")
	if !strings.Contains(cookie, "devcx_session=") {
		t.Fatal("no cookie")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Cookie", strings.Split(cookie, ";")[0])
	mrec := httptest.NewRecorder()
	srv.ServeHTTP(mrec, req)
	if mrec.Code != 200 || !strings.Contains(mrec.Body.String(), `"handle":"loginme"`) {
		t.Fatalf("/api/me → %d %s", mrec.Code, mrec.Body)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/me", nil)
	anon := httptest.NewRecorder()
	srv.ServeHTTP(anon, req)
	if anon.Code != 401 {
		t.Fatalf("anon /api/me → %d", anon.Code)
	}
}

// TestLoginRejectsNullPasswordHash 覆盖 dummy-hash 计时对齐防护里的一个陷阱：一个
// GitHub 注册（或任何方式产生的）用户，其 password_hash 为 NULL/空，是"用户存在"而非
// "用户不存在"。之前的实现只用 uid=="" 来判断"该走 dummy 分支"，但真正决定能否登录的
// 条件是"是否有可校验的真实密码哈希"；如果只靠 CheckPassword(dummyHash, pw) 的结果
// 就放行，那么任何人只要能拿到能让 CheckPassword(dummyHash, ·) 返回 true 的输入
// （也即 dummy 密码的明文本身）就能登录进这个没有设置密码的账号——这正是 dummy hash
// 计时对齐设计留下的一个认证绕过口子。这里直接插入一个 password_hash 为 NULL 的用户，
// 用一个明显不是其密码的值去登录，必须 401。
func TestLoginRejectsNullPasswordHash(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})

	if _, err := pool.Exec(context.Background(),
		`insert into users (id, email, password_hash, display_name, handle) values ($1,$2,null,$3,$4)`,
		ids.New(), "nopass@dev.cx", "No Pass", "nopassuser"); err != nil {
		t.Fatalf("seed null-password user: %v", err)
	}

	rec := postJSON(t, srv, "/api/auth/login", `{"email":"nopass@dev.cx","password":"whatever-guess"}`)
	if rec.Code != 401 {
		t.Fatalf("login against null password_hash → %d %s, want 401", rec.Code, rec.Body)
	}
}
