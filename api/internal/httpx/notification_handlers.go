package httpx

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const maxReplyExcerptRunes = 120

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
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

	where := []string{"user_id = $1"}
	args := []any{uid}
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
	sql := `select id, kind, actor_id, post_id, reply_id, project_id, read_at, created_at, message
		from notifications where ` + strings.Join(where, " and ") +
		` order by created_at desc, id desc limit $` + itoa(len(args))

	rows, err := s.deps.Pool.Query(ctx, sql, args...)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()

	type nRow struct {
		ID, Kind, ActorID   string
		PostID, ReplyID     *string
		ProjectID           *string
		ReadAt              *time.Time
		CreatedAt           time.Time
		Message             string
	}
	var list []nRow
	for rows.Next() {
		var n nRow
		if err := rows.Scan(&n.ID, &n.Kind, &n.ActorID, &n.PostID, &n.ReplyID,
			&n.ProjectID, &n.ReadAt, &n.CreatedAt, &n.Message); err != nil {
			Err(w, 500, "internal")
			return
		}
		list = append(list, n)
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}

	out := make([]map[string]any, 0, len(list))
	for _, n := range list {
		item := map[string]any{
			"id": n.ID, "kind": n.Kind,
			"read": n.ReadAt != nil,
			"created_at": n.CreatedAt,
			"actor": s.authorJSON(ctx, n.ActorID),
			"message": n.Message,
		}
		// post
		if n.PostID != nil {
			var slug, title string
			if err := s.deps.Pool.QueryRow(ctx,
				`select slug, title from posts where id=$1`, *n.PostID).
				Scan(&slug, &title); err == nil {
				item["post"] = map[string]any{"slug": slug, "title": title}
			} else {
				item["post"] = nil
			}
		} else {
			item["post"] = nil
		}
		// project
		if n.ProjectID != nil {
			var slug, name string
			if err := s.deps.Pool.QueryRow(ctx,
				`select slug, name from projects where id=$1`, *n.ProjectID).
				Scan(&slug, &name); err == nil {
				item["project"] = map[string]any{"slug": slug, "name": name}
			} else {
				item["project"] = nil
			}
		} else {
			item["project"] = nil
		}
		// reply_excerpt
		if n.ReplyID != nil {
			var body string
			if err := s.deps.Pool.QueryRow(ctx,
				`select body_md from replies where id=$1`, *n.ReplyID).Scan(&body); err == nil {
				item["reply_excerpt"] = truncRunes(body, maxReplyExcerptRunes)
			} else {
				item["reply_excerpt"] = nil
			}
		} else {
			item["reply_excerpt"] = nil
		}
		out = append(out, item)
	}

	var next any
	if len(list) == limit {
		last := list[len(list)-1]
		next = last.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
	}

	var unread int
	_ = s.deps.Pool.QueryRow(ctx,
		`select count(*) from notifications where user_id=$1 and read_at is null`, uid).
		Scan(&unread)

	WriteJSON(w, 200, map[string]any{
		"notifications": out,
		"next_cursor":   next,
		"unread_count":  unread,
	})
}

func (s *Server) handleMarkNotificationsRead(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	var in struct {
		IDs []string `json:"ids"`
		All bool     `json:"all"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	if !in.All && len(in.IDs) == 0 {
		Err(w, 400, "bad_input")
		return
	}
	ctx := r.Context()
	if in.All {
		if _, err := s.deps.Pool.Exec(ctx,
			`update notifications set read_at=now()
			 where user_id=$1 and read_at is null`, uid); err != nil {
			Err(w, 500, "internal")
			return
		}
	} else {
		if _, err := s.deps.Pool.Exec(ctx,
			`update notifications set read_at=now()
			 where user_id=$1 and id = any($2) and read_at is null`,
			uid, in.IDs); err != nil {
			Err(w, 500, "internal")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func truncRunes(s string, n int) string {
	if n <= 0 || utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// itoa avoids strconv import churn for tiny SQL index formatting (also used above).
func itoa(n int) string {
	return strconv.Itoa(n)
}
