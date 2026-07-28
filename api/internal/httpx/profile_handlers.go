package httpx

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"devcx/internal/handle"
)

// 用户可控文本的字符数上限（utf8.RuneCountInString，按字符而非字节计），与
// migrations/0004_github_id.sql 里的 check 约束一一对应，后者是最后一道兜底。
// URL 字段（头像、联系方式链接）复用 project_handlers.go 里的 maxURLLen，不再各自
// 定义同值的常量。
const (
	maxDisplayNameLen  = 64
	maxBioLen          = 2000
	maxWeeklyStatusLen = 280
)

// allowedURL 校验 URL 协议白名单。avatar_url 只允许 http/https（不需要 mailto）；
// 联系方式链接（allowMailto=true）额外放行 mailto:，用于邮箱联系方式。
// 拒绝 javascript:/data: 等可执行或可注入内容的 scheme。
func allowedURL(u string, allowMailto bool) bool {
	if strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") {
		return true
	}
	return allowMailto && strings.HasPrefix(u, "mailto:")
}

func (s *Server) handleRename(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	var req struct {
		Handle string `json:"handle"`
	}
	if err := ReadJSON(r, &req); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	newH := strings.ToLower(strings.TrimSpace(req.Handle))
	ctx := r.Context()

	var oldH string
	var changedAt *time.Time
	if err := s.deps.Pool.QueryRow(ctx,
		`select handle, handle_changed_at from users where id=$1`, uid).Scan(&oldH, &changedAt); err != nil {
		Err(w, 500, "internal")
		return
	}
	if changedAt != nil && time.Since(*changedAt) < 90*24*time.Hour {
		Err(w, 429, "rename_too_soon")
		return
	}
	if code, err := handle.Available(ctx, s.deps.Pool, newH); err != nil {
		Err(w, 500, "internal")
		return
	} else if code != "" {
		Err(w, 400, "handle_"+code)
		return
	}

	tx, err := s.deps.Pool.Begin(ctx)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`insert into handle_history (old_handle, user_id) values ($1,$2)`, oldH, uid); err != nil {
		Err(w, 500, "internal")
		return
	}
	if _, err := tx.Exec(ctx,
		`update users set handle=$1, handle_changed_at=now(), updated_at=now() where id=$2`,
		newH, uid); err != nil {
		if isUniqueViolation(err) {
			Err(w, 400, "handle_taken")
		} else {
			Err(w, 500, "internal")
		}
		return
	}
	if err := tx.Commit(ctx); err != nil {
		Err(w, 500, "internal")
		return
	}
	s.writeUserByID(w, r, uid, 200, true)
}

func (s *Server) handleResolve(w http.ResponseWriter, r *http.Request) {
	h := strings.ToLower(r.PathValue("handle"))
	ctx := r.Context()
	var uid string
	if err := s.deps.Pool.QueryRow(ctx,
		`select id from users where handle=$1`, h).Scan(&uid); err == nil {
		s.writeUserByID(w, r, uid, 200, false)
		return
	}
	var movedUID string
	if err := s.deps.Pool.QueryRow(ctx,
		`select user_id from handle_history where old_handle=$1`, h).Scan(&movedUID); err == nil {
		var current string
		s.deps.Pool.QueryRow(ctx, `select handle from users where id=$1`, movedUID).Scan(&current)
		WriteJSON(w, 200, map[string]string{"moved_to": current})
		return
	}
	Err(w, 404, "not_found")
}

func (s *Server) handlePublicUser(w http.ResponseWriter, r *http.Request) {
	h := strings.ToLower(r.PathValue("handle"))
	var uid string
	if err := s.deps.Pool.QueryRow(r.Context(),
		`select id from users where handle=$1`, h).Scan(&uid); err != nil {
		Err(w, 404, "not_found")
		return
	}
	s.writeUserByID(w, r, uid, 200, false)
}

var validStatus = map[string]bool{"building": true, "exploring": true, "paused": true, "supporting": true}

func (s *Server) handlePatchMe(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	var req struct {
		DisplayName  *string `json:"display_name"`
		Bio          *string `json:"bio"`
		Status       *string `json:"status"`
		WeeklyStatus *string `json:"weekly_status"`
		AvatarURL    *string `json:"avatar_url"`
		EmailWeekly  *bool   `json:"email_weekly"`
	}
	if err := ReadJSON(r, &req); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	if req.Status != nil && !validStatus[*req.Status] {
		Err(w, 400, "bad_status")
		return
	}
	if req.DisplayName != nil {
		if strings.TrimSpace(*req.DisplayName) == "" {
			Err(w, 400, "bad_input")
			return
		}
		if utf8.RuneCountInString(*req.DisplayName) > maxDisplayNameLen {
			Err(w, 400, "too_long")
			return
		}
	}
	if req.Bio != nil && utf8.RuneCountInString(*req.Bio) > maxBioLen {
		Err(w, 400, "too_long")
		return
	}
	if req.WeeklyStatus != nil && utf8.RuneCountInString(*req.WeeklyStatus) > maxWeeklyStatusLen {
		Err(w, 400, "too_long")
		return
	}
	if req.AvatarURL != nil && *req.AvatarURL != "" {
		// 空串放行：表示清空头像。非空则必须是 http(s)，拒绝 javascript:/data: 等
		// 会在公开档案页被回吐、可执行的 scheme。
		if !allowedURL(*req.AvatarURL, false) {
			Err(w, 400, "bad_avatar_url")
			return
		}
		if utf8.RuneCountInString(*req.AvatarURL) > maxURLLen {
			Err(w, 400, "too_long")
			return
		}
	}
	ctx := r.Context()
	if _, err := s.deps.Pool.Exec(ctx, `
		update users set
		  display_name = coalesce($1, display_name),
		  bio = coalesce($2, bio),
		  status = coalesce($3, status),
		  avatar_url = coalesce($4, avatar_url),
		  weekly_status = coalesce($5, weekly_status),
		  weekly_status_updated_at = case when $5::text is not null then now() else weekly_status_updated_at end,
		  email_weekly = coalesce($6, email_weekly),
		  updated_at = now()
		where id = $7`,
		req.DisplayName, req.Bio, req.Status, req.AvatarURL, req.WeeklyStatus, req.EmailWeekly, uid); err != nil {
		Err(w, 500, "internal")
		return
	}
	s.writeUserByID(w, r, uid, 200, true)
}

var validLinkKind = map[string]bool{"website": true, "github": true, "x": true, "email": true}

func (s *Server) handlePutLinks(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	var req []struct {
		Kind string `json:"kind"`
		URL  string `json:"url"`
	}
	if err := ReadJSON(r, &req); err != nil || len(req) > 8 {
		Err(w, 400, "bad_input")
		return
	}
	for _, l := range req {
		if !validLinkKind[l.Kind] || !allowedURL(l.URL, true) {
			Err(w, 400, "bad_link")
			return
		}
		if utf8.RuneCountInString(l.URL) > maxURLLen {
			Err(w, 400, "too_long")
			return
		}
	}
	ctx := r.Context()
	tx, err := s.deps.Pool.Begin(ctx)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer tx.Rollback(ctx)
	tx.Exec(ctx, `delete from user_links where user_id=$1`, uid)
	for i, l := range req {
		if _, err := tx.Exec(ctx,
			`insert into user_links (user_id, position, kind, url) values ($1,$2,$3,$4)`,
			uid, i, l.Kind, l.URL); err != nil {
			Err(w, 500, "internal")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		Err(w, 500, "internal")
		return
	}
	s.writeUserByID(w, r, uid, 200, true)
}
