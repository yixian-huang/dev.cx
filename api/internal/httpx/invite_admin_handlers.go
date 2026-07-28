package httpx

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"devcx/internal/invite"
)

func (s *Server) handleAdminListInvites(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	ctx := r.Context()
	rows, err := s.deps.Pool.Query(ctx,
		`select code, note, max_uses, used_count, expires_at, created_at
		 from invite_codes order by created_at desc limit 100`)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var code, note string
		var maxUses, used int
		var expiresAt *time.Time
		var createdAt time.Time
		if err := rows.Scan(&code, &note, &maxUses, &used, &expiresAt, &createdAt); err != nil {
			Err(w, 500, "internal")
			return
		}
		active := used < maxUses && (expiresAt == nil || expiresAt.After(time.Now()))
		out = append(out, map[string]any{
			"code": code, "note": note, "max_uses": maxUses, "used_count": used,
			"expires_at": expiresAt, "created_at": createdAt, "active": active,
		})
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}
	WriteJSON(w, 200, map[string]any{"invites": out})
}

func (s *Server) handleAdminMintInvites(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	var in struct {
		N    int    `json:"n"`
		Uses int    `json:"uses"`
		Note string `json:"note"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	if in.N == 0 {
		in.N = 1
	}
	if in.Uses == 0 {
		in.Uses = 1
	}
	if in.N < 1 || in.N > 50 || in.Uses < 1 || in.Uses > 100 {
		Err(w, 400, "bad_input")
		return
	}
	in.Note = strings.TrimSpace(in.Note)
	if utf8.RuneCountInString(in.Note) > 100 {
		Err(w, 400, "too_long")
		return
	}
	codes, err := invite.Mint(r.Context(), s.deps.Pool, in.N, in.Uses, in.Note)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"codes": codes})
}

// handleAdminVoidInvite 作废=置 expires_at=now():invite.Redeem 已有过期检查,零迁移。
// 只对「当前仍有效」的码生效——重复作废/不存在都是 404,幂等语义靠调用方看列表。
func (s *Server) handleAdminVoidInvite(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	tag, err := s.deps.Pool.Exec(r.Context(),
		`update invite_codes set expires_at=now()
		 where code=$1 and (expires_at is null or expires_at > now())`,
		r.PathValue("code"))
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	if tag.RowsAffected() == 0 {
		Err(w, 404, "not_found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
