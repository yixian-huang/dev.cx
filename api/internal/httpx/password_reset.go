package httpx

import (
	"log"
	"net/http"
	"strings"
	"time"

	"devcx/internal/auth"
	"devcx/internal/mailer"
	"devcx/internal/settings"
)

const resetTokenTTL = time.Hour
const resetResendCooldown = time.Minute

// handleForgotPassword 恒 204:响应不区分「邮箱不存在 / 冷却中 / 已发送」,防账号枚举。
// GitHub-only 账号(password_hash null)同样可走此流程补设密码。
func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Email == "" {
		Err(w, 400, "bad_input")
		return
	}
	ctx := r.Context()
	var uid string
	var sentAt *time.Time
	err := s.deps.Pool.QueryRow(ctx,
		`select id, password_reset_sent_at from users where email=$1`, in.Email).Scan(&uid, &sentAt)
	if err == nil && (sentAt == nil || time.Since(*sentAt) >= resetResendCooldown) {
		token, terr := newVerifyToken()
		if terr == nil {
			if _, uerr := s.deps.Pool.Exec(ctx,
				`update users set password_reset_token_hash=$2, password_reset_sent_at=now() where id=$1`,
				uid, sha256Hex(token)); uerr == nil {
				s.sendResetEmail(r, in.Email, token)
			}
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) sendResetEmail(r *http.Request, email, token string) {
	ctx := r.Context()
	host := settings.Resolve(ctx, s.deps.Pool, "smtp_host")
	port := settings.Resolve(ctx, s.deps.Pool, "smtp_port")
	from := settings.Resolve(ctx, s.deps.Pool, "smtp_from")
	if host == "" || port == "" || from == "" {
		log.Printf("password-reset: smtp unconfigured, skip send")
		return
	}
	link := s.deps.Cfg.BaseURL + "/reset-password?token=" + token
	body := "有人(希望是你本人)请求重置 dev.cx 密码 / A password reset was requested for your dev.cx account:\n\n" +
		link + "\n\n链接 1 小时内有效;若非本人操作请忽略本邮件,密码不会改变。\nThe link expires in 1 hour. If you didn't request this, ignore this message."
	if err := mailer.Send(host, port,
		settings.Resolve(ctx, s.deps.Pool, "smtp_username"),
		settings.Resolve(ctx, s.deps.Pool, "smtp_password"),
		from, email, "重置你的 dev.cx 密码 / Reset your password", body); err != nil {
		log.Printf("password-reset: send failed: %v", err)
	}
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	in.Token = strings.TrimSpace(in.Token)
	if in.Token == "" {
		Err(w, 400, "bad_input")
		return
	}
	if len(in.Password) < 8 {
		Err(w, 400, "password_too_short")
		return
	}
	ctx := r.Context()
	var uid string
	if err := s.deps.Pool.QueryRow(ctx,
		`select id from users
		 where password_reset_token_hash=$1
		   and password_reset_sent_at > now() - interval '1 hour'`,
		sha256Hex(in.Token)).Scan(&uid); err != nil {
		Err(w, 400, "token_invalid")
		return
	}
	hash, err := auth.HashPassword(in.Password)
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
	if _, err := tx.Exec(ctx,
		`update users set password_hash=$2, password_reset_token_hash=null, updated_at=now() where id=$1`,
		uid, hash); err != nil {
		Err(w, 500, "internal")
		return
	}
	// 重置即撤销全部既有会话(标准语义:凡触发重置,视为凭据可能已泄露)。
	if _, err := tx.Exec(ctx, `delete from sessions where user_id=$1`, uid); err != nil {
		Err(w, 500, "internal")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		Err(w, 500, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
