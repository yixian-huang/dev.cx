package httpx

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"devcx/internal/mod"
)

const (
	maxModReasonLen   = 200
	maxWarnMessageLen = 500
	defaultMuteDays   = 7
)

// requireAdmin:未登录 401、非 admin 403,写好响应后返回 ok=false。
func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return "", false
	}
	if !s.isAdmin(r.Context(), uid) {
		Err(w, 403, "forbidden")
		return "", false
	}
	return uid, true
}

func (s *Server) modErr(w http.ResponseWriter, err error) {
	if errors.Is(err, mod.ErrNotFound) {
		Err(w, 404, "not_found")
		return
	}
	Err(w, 500, "internal")
}

// readReason 读 {"reason":...} 并校验非空、封顶。
func readReason(w http.ResponseWriter, r *http.Request) (string, bool) {
	var in struct {
		Reason string `json:"reason"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return "", false
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" {
		Err(w, 400, "bad_input")
		return "", false
	}
	if utf8.RuneCountInString(in.Reason) > maxModReasonLen {
		Err(w, 400, "too_long")
		return "", false
	}
	return in.Reason, true
}

func (s *Server) postIDBySlug(r *http.Request) (string, bool) {
	var id string
	err := s.deps.Pool.QueryRow(r.Context(),
		`select id from posts where slug=$1`, strings.ToLower(r.PathValue("slug"))).Scan(&id)
	return id, err == nil
}

func (s *Server) userIDByHandle(r *http.Request) (string, bool) {
	var id string
	err := s.deps.Pool.QueryRow(r.Context(),
		`select id from users where handle=$1`, strings.ToLower(r.PathValue("handle"))).Scan(&id)
	return id, err == nil
}

func (s *Server) handleAdminHidePost(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	reason, ok := readReason(w, r)
	if !ok {
		return
	}
	pid, found := s.postIDBySlug(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	if err := mod.HidePost(r.Context(), s.deps.Pool, uid, pid, reason); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminUnhidePost(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	pid, found := s.postIDBySlug(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	if err := mod.UnhidePost(r.Context(), s.deps.Pool, uid, pid); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminDeletePost(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	reason, ok := readReason(w, r)
	if !ok {
		return
	}
	pid, found := s.postIDBySlug(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	if err := mod.DeletePost(r.Context(), s.deps.Pool, uid, pid, reason); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminHideReply(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	reason, ok := readReason(w, r)
	if !ok {
		return
	}
	if err := mod.HideReply(r.Context(), s.deps.Pool, uid, r.PathValue("id"), reason); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminUnhideReply(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	if err := mod.UnhideReply(r.Context(), s.deps.Pool, uid, r.PathValue("id")); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminDeleteReply(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	reason, ok := readReason(w, r)
	if !ok {
		return
	}
	if err := mod.DeleteReply(r.Context(), s.deps.Pool, uid, r.PathValue("id"), reason); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminGetUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	ctx := r.Context()
	var id, hdl, dn, email, role string
	var mutedUntil, suspendedAt *time.Time
	var createdAt time.Time
	if err := s.deps.Pool.QueryRow(ctx,
		`select id, handle, display_name, email, role, muted_until, suspended_at, created_at
		 from users where handle=$1`, strings.ToLower(r.PathValue("handle"))).
		Scan(&id, &hdl, &dn, &email, &role, &mutedUntil, &suspendedAt, &createdAt); err != nil {
		Err(w, 404, "not_found")
		return
	}
	var warnCount int
	_ = s.deps.Pool.QueryRow(ctx,
		`select count(*) from mod_actions where action='warn' and target_kind='user' and target_id=$1`,
		id).Scan(&warnCount)
	WriteJSON(w, 200, map[string]any{"user": map[string]any{
		"id": id, "handle": hdl, "display_name": dn, "email": email, "role": role,
		"muted_until": mutedUntil, "suspended_at": suspendedAt,
		"warn_count": warnCount, "created_at": createdAt,
	}})
}

func (s *Server) handleAdminWarn(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Message string `json:"message"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	in.Message = strings.TrimSpace(in.Message)
	if in.Message == "" {
		Err(w, 400, "bad_input")
		return
	}
	if utf8.RuneCountInString(in.Message) > maxWarnMessageLen {
		Err(w, 400, "too_long")
		return
	}
	target, found := s.userIDByHandle(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	if err := mod.Warn(r.Context(), s.deps.Pool, uid, target, in.Message); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminMute(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Until  string `json:"until"`
		Reason string `json:"reason"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	// mute 必须有期限(spec 决策 3):until 缺省 = now+7d;无限期场景用 suspend。
	until := time.Now().Add(defaultMuteDays * 24 * time.Hour)
	if strings.TrimSpace(in.Until) != "" {
		t, err := time.Parse(time.RFC3339, in.Until)
		if err != nil || !t.After(time.Now()) {
			Err(w, 400, "bad_until")
			return
		}
		until = t
	}
	target, found := s.userIDByHandle(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	if err := mod.Mute(r.Context(), s.deps.Pool, uid, target, until, strings.TrimSpace(in.Reason)); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminUnmute(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	target, found := s.userIDByHandle(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	if err := mod.Unmute(r.Context(), s.deps.Pool, uid, target); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminSuspend(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	reason, ok := readReason(w, r)
	if !ok {
		return
	}
	target, found := s.userIDByHandle(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	// 不允许 suspend 自己——唯一 admin 把自己锁死后只能 psql 救。
	if target == uid {
		Err(w, 400, "self_target")
		return
	}
	if err := mod.Suspend(r.Context(), s.deps.Pool, uid, target, reason); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminUnsuspend(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	target, found := s.userIDByHandle(r)
	if !found {
		Err(w, 404, "not_found")
		return
	}
	if err := mod.Unsuspend(r.Context(), s.deps.Pool, uid, target); err != nil {
		s.modErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminActions(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	ctx := r.Context()
	q := r.URL.Query()
	limit := 20
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	where := []string{"true"}
	args := []any{}
	if c := q.Get("cursor"); c != "" {
		ts, id, ok := parseCursor(c)
		if !ok {
			Err(w, 400, "bad_cursor")
			return
		}
		args = append(args, ts, id)
		where = append(where,
			`(created_at, id) < ($`+itoa(len(args)-1)+`, $`+itoa(len(args))+`)`)
	}
	args = append(args, limit)
	rows, err := s.deps.Pool.Query(ctx,
		`select id, actor_id, action, target_kind, target_id, reason, created_at
		 from mod_actions where `+strings.Join(where, " and ")+
			` order by created_at desc, id desc limit $`+itoa(len(args)), args...)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()
	type aRow struct {
		ID, ActorID, Action, TargetKind, TargetID, Reason string
		CreatedAt                                         time.Time
	}
	var list []aRow
	for rows.Next() {
		var a aRow
		if err := rows.Scan(&a.ID, &a.ActorID, &a.Action, &a.TargetKind, &a.TargetID,
			&a.Reason, &a.CreatedAt); err != nil {
			Err(w, 500, "internal")
			return
		}
		list = append(list, a)
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, a := range list {
		item := map[string]any{
			"id": a.ID, "action": a.Action, "target_kind": a.TargetKind,
			"target_id": a.TargetID, "reason": a.Reason, "created_at": a.CreatedAt,
			"actor": s.authorJSON(ctx, a.ActorID),
			"post":  nil, "user_handle": nil,
		}
		// 目标已被硬删时查不到——保持 null,审计行本身仍完整。
		switch a.TargetKind {
		case "post":
			var slug, title string
			if err := s.deps.Pool.QueryRow(ctx,
				`select slug, title from posts where id=$1`, a.TargetID).Scan(&slug, &title); err == nil {
				item["post"] = map[string]any{"slug": slug, "title": title}
			}
		case "reply":
			var slug string
			if err := s.deps.Pool.QueryRow(ctx,
				`select p.slug from replies r join posts p on p.id=r.post_id where r.id=$1`,
				a.TargetID).Scan(&slug); err == nil {
				item["post"] = map[string]any{"slug": slug, "title": ""}
			}
		case "user":
			var hdl string
			if err := s.deps.Pool.QueryRow(ctx,
				`select handle from users where id=$1`, a.TargetID).Scan(&hdl); err == nil {
				item["user_handle"] = hdl
			}
		}
		out = append(out, item)
	}
	var next any
	if len(list) == limit {
		last := list[len(list)-1]
		next = last.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
	}
	WriteJSON(w, 200, map[string]any{"actions": out, "next_cursor": next})
}
