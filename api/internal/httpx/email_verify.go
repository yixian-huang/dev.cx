package httpx

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"devcx/internal/mailer"
	"devcx/internal/settings"
)

const verifyResendCooldown = time.Minute

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func newVerifyToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// issueEmailVerification 生成新 token(旧 token 即作废)、写 hash 与 sent_at,并
// best-effort 发信:SMTP 未配置或发送失败都不阻塞调用方——token 已就位,配好后可重发。
func (s *Server) issueEmailVerification(ctx context.Context, uid string) {
	token, err := newVerifyToken()
	if err != nil {
		return
	}
	tag, err := s.deps.Pool.Exec(ctx,
		`update users set email_verify_token_hash=$2, email_verify_sent_at=now()
		 where id=$1 and email_verified_at is null`,
		uid, sha256Hex(token))
	if err != nil || tag.RowsAffected() == 0 {
		return
	}
	var email string
	if err := s.deps.Pool.QueryRow(ctx, `select email from users where id=$1`, uid).Scan(&email); err != nil {
		return
	}
	host := settings.Resolve(ctx, s.deps.Pool, "smtp_host")
	port := settings.Resolve(ctx, s.deps.Pool, "smtp_port")
	from := settings.Resolve(ctx, s.deps.Pool, "smtp_from")
	if host == "" || port == "" || from == "" {
		log.Printf("email-verify: smtp unconfigured, skip send uid=%s", uid)
		return
	}
	link := s.deps.Cfg.BaseURL + "/verify-email?token=" + token
	body := "点击链接验证你的 dev.cx 邮箱 / Verify your dev.cx email:\n\n" + link +
		"\n\n链接 24 小时内有效;若非本人操作请忽略本邮件。\nThe link expires in 24 hours. If you didn't request this, ignore this message."
	if err := mailer.Send(host, port,
		settings.Resolve(ctx, s.deps.Pool, "smtp_username"),
		settings.Resolve(ctx, s.deps.Pool, "smtp_password"),
		from, email, "验证你的 dev.cx 邮箱 / Verify your email", body); err != nil {
		log.Printf("email-verify: send failed uid=%s: %v", uid, err)
	}
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
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
	// 24h 有效期直接编进 where:过期与不存在同响应,不泄露 token 是否曾经有效。
	tag, err := s.deps.Pool.Exec(r.Context(),
		`update users set email_verified_at=now(), email_verify_token_hash=null
		 where email_verify_token_hash=$1
		   and email_verified_at is null
		   and email_verify_sent_at > now() - interval '24 hours'`,
		sha256Hex(in.Token))
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	if tag.RowsAffected() == 0 {
		Err(w, 400, "token_invalid")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleResendVerification(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	ctx := r.Context()
	var verifiedAt, sentAt *time.Time
	if err := s.deps.Pool.QueryRow(ctx,
		`select email_verified_at, email_verify_sent_at from users where id=$1`, uid).
		Scan(&verifiedAt, &sentAt); err != nil {
		Err(w, 500, "internal")
		return
	}
	if verifiedAt != nil {
		Err(w, 400, "already_verified")
		return
	}
	if sentAt != nil && time.Since(*sentAt) < verifyResendCooldown {
		Err(w, 429, "resend_cooldown")
		return
	}
	s.issueEmailVerification(ctx, uid)
	w.WriteHeader(http.StatusNoContent)
}
