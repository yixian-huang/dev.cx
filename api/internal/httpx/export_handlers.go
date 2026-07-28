package httpx

import (
	"context"
	"net/http"
	"time"
)

// rowsToMaps 把任意查询结果按列名展开成 []map——导出是「原样带走」语义,
// 不复用面向展示的 postJSON/projectJSON(那些会裁剪与聚合)。
func rowsToMaps(ctx context.Context, s *Server, sql string, args ...any) ([]map[string]any, error) {
	rows, err := s.deps.Pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	fields := rows.FieldDescriptions()
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, f := range fields {
			m[string(f.Name)] = vals[i]
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	ctx := r.Context()

	var handle string
	if err := s.deps.Pool.QueryRow(ctx, `select handle from users where id=$1`, uid).Scan(&handle); err != nil {
		Err(w, 500, "internal")
		return
	}

	out := map[string]any{
		"format":      "devcx-export-v1",
		"exported_at": time.Now().UTC(),
	}
	// 自己的隐藏内容也导出(那是用户自己的数据);password_hash 之类凭据绝不导出。
	sections := []struct {
		key, sql string
	}{
		{"user", `select id, email, display_name, handle, bio, avatar_url, status,
			weekly_status, github_login, github_verified, created_at from users where id=$1`},
		{"links", `select kind, url, position from user_links where user_id=$1 order by position`},
		{"handle_history", `select old_handle, changed_at from handle_history where user_id=$1 order by changed_at`},
		{"projects", `select slug, name, tagline, description_md, stage, audience, screenshots,
			tags, links, created_at, updated_at from projects where owner_id=$1 order by created_at`},
		{"posts", `select slug, type, title, body_md, status, feedback_wanted, uncertainties, links,
			hidden_at, hidden_reason, created_at, updated_at from posts where author_id=$1 order by created_at`},
		{"replies", `select r.body_md, r.floor, r.created_at, p.slug as post_slug
			from replies r join posts p on p.id=r.post_id where r.author_id=$1 order by r.created_at`},
		{"follows", `select target_kind, target_id, created_at from follows where follower_id=$1 order by created_at`},
	}
	for _, sec := range sections {
		rowsOut, err := rowsToMaps(ctx, s, sec.sql, uid)
		if err != nil {
			Err(w, 500, "internal")
			return
		}
		if sec.key == "user" {
			if len(rowsOut) == 1 {
				out["user"] = rowsOut[0]
			}
			continue
		}
		out[sec.key] = rowsOut
	}

	w.Header().Set("Content-Disposition",
		`attachment; filename="devcx-export-`+handle+`-`+time.Now().UTC().Format("20060102")+`.json"`)
	WriteJSON(w, 200, out)
}
