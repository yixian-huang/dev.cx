package httpx

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"devcx/internal/auth"
)

const stateCookie = "devcx_oauth_state"

func (s *Server) handleGitHubStart(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	if mode != "link" {
		mode = "login"
	}
	uid := currentUserID(r)
	if mode == "link" && uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		Err(w, 500, "internal")
		return
	}
	state := mode + "." + hex.EncodeToString(raw)
	if mode == "link" {
		// 把发起者身份编进 state：回调时与 currentUserID(r) 比对，防止 state 10 分钟
		// 有效期内会话切换到另一账号，导致 GitHub 账号被绑到错误的用户上。
		// uid 是 ULID，不含 '.'，与后续 strings.SplitN(..., 3) 解析不冲突。
		state = mode + "." + uid + "." + hex.EncodeToString(raw)
	}
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: state, Path: "/",
		HttpOnly: true, Secure: s.deps.Cfg.Env == "prod", SameSite: http.SameSiteLaxMode, MaxAge: 600})
	http.Redirect(w, r, auth.GitHubOAuthConfig(s.effectiveCfg(r.Context())).AuthCodeURL(state), http.StatusFound)
}

func (s *Server) handleGitHubCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	c, err := r.Cookie(stateCookie)
	if err != nil || c.Value == "" || r.URL.Query().Get("state") != c.Value {
		Err(w, 400, "bad_state")
		return
	}
	parts := strings.SplitN(c.Value, ".", 3)
	mode := parts[0]
	// state 用后即清：在每条路径返回前清除，且晚于任何会话/绑定 cookie 写入——
	// httptest.ResponseRecorder.Header().Get("Set-Cookie") 只返回首个写入的 Set-Cookie，
	// 先清 state 会让调用方读不到后写入的 devcx_session。
	clearState := func() {
		http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: "", Path: "/", MaxAge: -1,
			Secure: s.deps.Cfg.Env == "prod"})
	}

	// state 绑定了发起者身份（mode=link 时 parts[1] 为发起时的 uid）：如果回调时的会话
	// 用户与发起时不同（例如授权往返期间切换了账号），一律拒绝，避免绑错账号。
	if mode == "link" && (len(parts) < 3 || parts[1] != currentUserID(r)) {
		clearState()
		Err(w, 400, "bad_state")
		return
	}

	ghID, login, err := auth.GitHubLogin(ctx, s.effectiveCfg(ctx), r.URL.Query().Get("code"))
	if err != nil {
		clearState()
		Err(w, 502, "github_error")
		return
	}

	if mode == "link" {
		uid := currentUserID(r)
		if uid == "" {
			clearState()
			Err(w, 401, "auth_required")
			return
		}
		// github_id 是身份的唯一判据；github_login 只是随之更新的展示字段，
		// GitHub 改名不影响已绑定的账号匹配（见 auth.GitHubLogin 注释）。
		if _, err := s.deps.Pool.Exec(ctx,
			`update users set github_id=$1, github_login=$2, github_verified=true, updated_at=now() where id=$3`,
			ghID, login, uid); err != nil {
			clearState()
			if isUniqueViolation(err) {
				Err(w, 409, "github_already_linked")
			} else {
				Err(w, 500, "internal")
			}
			return
		}
		clearState()
		http.Redirect(w, r, "/me", http.StatusFound)
		return
	}
	// mode == login：按 github_id（不可变）查已绑定用户，不能按 github_login 匹配——
	// 后者可变，原用户改名/注销后可能被他人注册，按 login 匹配会导致账号接管。
	var uid string
	if err := s.deps.Pool.QueryRow(ctx,
		`select id from users where github_id=$1`, ghID).Scan(&uid); err != nil {
		clearState()
		http.Redirect(w, r, "/login?error=invite_required", http.StatusFound)
		return
	}
	var suspendedAt *time.Time
	_ = s.deps.Pool.QueryRow(ctx, `select suspended_at from users where id=$1`, uid).Scan(&suspendedAt)
	if suspendedAt != nil {
		clearState()
		http.Redirect(w, r, "/login?error=suspended", http.StatusFound)
		return
	}
	token, err := auth.CreateSession(ctx, s.deps.Pool, uid)
	if err != nil {
		clearState()
		Err(w, 500, "internal")
		return
	}
	auth.SetSessionCookie(w, token, s.deps.Cfg.Env == "prod")
	clearState()
	http.Redirect(w, r, "/", http.StatusFound)
}
