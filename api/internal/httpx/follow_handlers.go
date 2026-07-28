package httpx

import (
	"context"
	"net/http"
	"strings"

	"devcx/internal/ids"
)

// resolveFollowTarget 把路径中的 handle/slug 解析为内部 id。
// 返回 (targetID, errorCode)；errorCode 非空时调用方按 http 码写出。
func (s *Server) resolveFollowTarget(ctx context.Context, kind, id string) (string, string) {
	id = strings.ToLower(strings.TrimSpace(id))
	if id == "" {
		return "", "not_found"
	}
	switch kind {
	case "user":
		var uid string
		if err := s.deps.Pool.QueryRow(ctx,
			`select id from users where handle=$1`, id).Scan(&uid); err != nil {
			return "", "not_found"
		}
		return uid, ""
	case "project":
		var pid string
		if err := s.deps.Pool.QueryRow(ctx,
			`select id from projects where slug=$1`, id).Scan(&pid); err != nil {
			return "", "not_found"
		}
		return pid, ""
	default:
		return "", "bad_kind"
	}
}

func (s *Server) handleFollow(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	kind := r.PathValue("kind")
	id := r.PathValue("id")
	ctx := r.Context()

	targetID, code := s.resolveFollowTarget(ctx, kind, id)
	if code == "bad_kind" {
		Err(w, 400, "bad_kind")
		return
	}
	if code != "" {
		Err(w, 404, "not_found")
		return
	}
	if kind == "user" && targetID == uid {
		Err(w, 400, "bad_target")
		return
	}

	tag, err := s.deps.Pool.Exec(ctx,
		`insert into follows (follower_id, target_kind, target_id)
		 values ($1, $2, $3) on conflict do nothing`,
		uid, kind, targetID)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	// 仅当真插入且目标是 user 时生成 follow 通知（幂等：冲突不插通知）。
	if tag.RowsAffected() > 0 && kind == "user" {
		if _, err := s.deps.Pool.Exec(ctx,
			`insert into notifications (id, user_id, kind, actor_id)
			 values ($1, $2, 'follow', $3)`,
			ids.New(), targetID, uid); err != nil {
			Err(w, 500, "internal")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUnfollow(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	kind := r.PathValue("kind")
	id := r.PathValue("id")
	ctx := r.Context()

	targetID, code := s.resolveFollowTarget(ctx, kind, id)
	if code == "bad_kind" {
		Err(w, 400, "bad_kind")
		return
	}
	if code != "" {
		Err(w, 404, "not_found")
		return
	}

	if _, err := s.deps.Pool.Exec(ctx,
		`delete from follows where follower_id=$1 and target_kind=$2 and target_id=$3`,
		uid, kind, targetID); err != nil {
		Err(w, 500, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
