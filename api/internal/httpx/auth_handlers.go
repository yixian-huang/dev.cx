package httpx

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"devcx/internal/auth"
	"devcx/internal/handle"
	"devcx/internal/ids"
	"devcx/internal/invite"
)

// dummyPasswordHash is a bcrypt-hashed dummy password (cost 12, plaintext intentionally meaningless).
// Used to prevent timing-based account enumeration: even when a user doesn't exist or has no password,
// we still perform a CheckPassword call against this hash to equalize response times.
const dummyPasswordHash = "$2a$12$ShCBx2sRlBg2SI0AtBKuZec8nO3Qe2t5txm8UiRvNPsC42W33sBx2"

type registerReq struct {
	InviteCode  string `json:"invite_code"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Handle      string `json:"handle"`
	DisplayName string `json:"display_name"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := ReadJSON(r, &req); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Handle = strings.ToLower(strings.TrimSpace(req.Handle))
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.Email == "" || len(req.Password) < 8 || req.DisplayName == "" {
		Err(w, 400, "bad_input")
		return
	}
	if utf8.RuneCountInString(req.DisplayName) > maxDisplayNameLen {
		Err(w, 400, "too_long")
		return
	}
	ctx := r.Context()
	if code, err := handle.Available(ctx, s.deps.Pool, req.Handle); err != nil {
		Err(w, 500, "internal")
		return
	} else if code != "" {
		Err(w, 400, "handle_"+code)
		return // handle_invalid | handle_reserved | handle_taken
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		Err(w, 500, "internal")
		return
	}

	tx, err := s.deps.Pool.Begin(ctx)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer tx.Rollback(ctx)

	uid := ids.New()
	if _, err := tx.Exec(ctx,
		`insert into users (id,email,password_hash,display_name,handle) values ($1,$2,$3,$4,$5)`,
		uid, req.Email, hash, req.DisplayName, req.Handle); err != nil {
		if isUniqueViolation(err) {
			Err(w, 400, "email_taken") // email/handle 唯一冲突在此兜底
		} else {
			Err(w, 500, "internal")
		}
		return
	}
	if err := invite.Redeem(ctx, tx, req.InviteCode, uid); err != nil {
		if errors.Is(err, invite.ErrInviteInvalid) {
			Err(w, 400, "invite_invalid")
			return
		}
		Err(w, 500, "internal")
		return
	}
	token, err := auth.CreateSession(ctx, tx, uid)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		Err(w, 500, "internal")
		return
	}

	auth.SetSessionCookie(w, token, s.deps.Cfg.Env == "prod")
	s.issueEmailVerification(ctx, uid)
	s.writeUserByID(w, r, uid, http.StatusCreated, true)
}

// decideLoginOutcome is the isolated boolean gate behind handleLogin's password
// check, pulled out so the historical bug (blocking item 1: null password_hash
// bypass) can be regression-tested without needing to know dummyPasswordHash's
// plaintext — which is infeasible even for us, since it's a bcrypt hash of a
// discarded random value.
//
// The previous implementation effectively computed `match && uid != ""`, i.e. it
// only guarded against "no such row", not "row exists but has no real password".
// For a NULL-password_hash account, hasRealHash is false but a real row (uid) does
// exist; if match ever came back true for such an account (e.g. the caller somehow
// knew/derived the dummy hash's plaintext), the old formula would incorrectly grant
// access. The fix requires hasRealHash regardless of match.
func decideLoginOutcome(hasRealHash, match bool) bool {
	return hasRealHash && match
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := ReadJSON(r, &req); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	ctx := r.Context()
	var uid, hash string
	err := s.deps.Pool.QueryRow(ctx,
		`select id, coalesce(password_hash,'') from users where email=$1`,
		strings.ToLower(strings.TrimSpace(req.Email))).Scan(&uid, &hash)

	// Prevent timing-based account enumeration: always call CheckPassword,
	// even if user doesn't exist or has no password (use dummy hash instead).
	//
	// hasRealHash must capture "does this account have a real, checkable password
	// hash" — not just "does the row exist". A GitHub-only account (password_hash
	// NULL) has uid != "" but hash == ""; checking uid == "" alone would let anyone
	// in with the dummy hash's plaintext (see decideLoginOutcome). match is always
	// computed (never short-circuited) so the timing profile stays identical whether
	// the account is missing, has no password, or has a real one that doesn't match.
	hasRealHash := err == nil && hash != ""
	hashToCheck := hash
	if !hasRealHash {
		hashToCheck = dummyPasswordHash
	}
	match := auth.CheckPassword(hashToCheck, req.Password)
	if !decideLoginOutcome(hasRealHash, match) {
		Err(w, 401, "bad_credentials")
		return
	}

	var suspendedAt *time.Time
	_ = s.deps.Pool.QueryRow(ctx, `select suspended_at from users where id=$1`, uid).Scan(&suspendedAt)
	if suspendedAt != nil {
		Err(w, 403, "suspended")
		return
	}

	token, err := auth.CreateSession(ctx, s.deps.Pool, uid)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	auth.SetSessionCookie(w, token, s.deps.Cfg.Env == "prod")
	s.writeUserByID(w, r, uid, 200, true)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.CookieName); err == nil {
		_ = auth.DestroySession(r.Context(), s.deps.Pool, c.Value)
	}
	auth.ClearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	s.writeUserByID(w, r, uid, 200, true)
}

// writeUserByID 输出统一 user JSON(含 links);profile_handlers 亦复用。
// includeEmail 只在"登录者本人"语境为 true——公开档案端点(resolve/public user)
// 绝不能带 email(隐私边界)。
func (s *Server) writeUserByID(w http.ResponseWriter, r *http.Request, uid string, code int, includeEmail bool) {
	ctx := r.Context()
	u := map[string]any{}
	var id, hdl, dn, bio, avatar, status, weekly string
	var ghVerified bool
	err := s.deps.Pool.QueryRow(ctx,
		`select id, handle, display_name, bio, avatar_url, status, weekly_status, github_verified
		 from users where id=$1`, uid).
		Scan(&id, &hdl, &dn, &bio, &avatar, &status, &weekly, &ghVerified)
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	u["id"], u["handle"], u["display_name"], u["bio"] = id, hdl, dn, bio
	u["avatar_url"], u["status"], u["weekly_status"], u["github_verified"] = avatar, status, weekly, ghVerified
	if includeEmail {
		var email string
		if err := s.deps.Pool.QueryRow(ctx, `select email from users where id=$1`, uid).Scan(&email); err != nil {
			Err(w, 500, "internal")
			return
		}
		u["email"] = email
		// me 语境附带未读通知数（公开 resolve/public user 不带）。
		var unread int
		_ = s.deps.Pool.QueryRow(ctx,
			`select count(*) from notifications where user_id=$1 and read_at is null`, uid).
			Scan(&unread)
		u["unread_notifications"] = unread
		// 本人语境附带 role 与禁言期限:前端据此显示 admin 入口与「禁言至 X」状态。
		var role string
		var emailWeekly bool
		var mutedUntil, emailVerifiedAt *time.Time
		if err := s.deps.Pool.QueryRow(ctx,
			`select role, muted_until, email_verified_at, email_weekly from users where id=$1`, uid).
			Scan(&role, &mutedUntil, &emailVerifiedAt, &emailWeekly); err == nil {
			u["role"] = role
			u["email_verified"] = emailVerifiedAt != nil
			u["email_weekly"] = emailWeekly
			if mutedUntil != nil && mutedUntil.After(time.Now()) {
				u["muted_until"] = mutedUntil
			}
		}
	}

	links := []map[string]string{}
	rows, _ := s.deps.Pool.Query(ctx,
		`select kind, url from user_links where user_id=$1 order by position`, uid)
	defer rows.Close()
	for rows.Next() {
		var k, url string
		rows.Scan(&k, &url)
		links = append(links, map[string]string{"kind": k, "url": url})
	}
	u["links"] = links

	// follower_count 恒带；viewer_following 仅登录态。
	var followerCount int
	s.deps.Pool.QueryRow(ctx,
		`select count(*) from follows where target_kind='user' and target_id=$1`, uid).
		Scan(&followerCount)
	u["follower_count"] = followerCount
	if viewer := currentUserID(r); viewer != "" {
		var following bool
		s.deps.Pool.QueryRow(ctx,
			`select exists(select 1 from follows
			 where follower_id=$1 and target_kind='user' and target_id=$2)`,
			viewer, uid).Scan(&following)
		u["viewer_following"] = following
	}

	WriteJSON(w, code, map[string]any{"user": u})
}
