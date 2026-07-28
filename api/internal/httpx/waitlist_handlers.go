package httpx

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// handleJoinWaitlist 无鉴权公开写入口:恒 204(重复静默去重,不泄露是否已在列),
// 依赖 middleware 的限流覆盖(/api/waitlist 与 /api/auth/* 同池)。
func (s *Server) handleJoinWaitlist(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	at := strings.Index(in.Email, "@")
	if at < 1 || at == len(in.Email)-1 || utf8.RuneCountInString(in.Email) > 254 {
		Err(w, 400, "bad_input")
		return
	}
	if _, err := s.deps.Pool.Exec(r.Context(),
		`insert into waitlist (email) values ($1) on conflict do nothing`, in.Email); err != nil {
		Err(w, 500, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminWaitlist(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.deps.Pool.Query(r.Context(),
		`select email, created_at from waitlist order by created_at limit 500`)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var email string
		var at time.Time
		if err := rows.Scan(&email, &at); err != nil {
			Err(w, 500, "internal")
			return
		}
		out = append(out, map[string]any{"email": email, "created_at": at})
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}
	WriteJSON(w, 200, map[string]any{"waitlist": out, "count": len(out)})
}
