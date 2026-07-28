package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"devcx/internal/db"
)

const (
	CookieName = "devcx_session"
	sessionTTL = 30 * 24 * time.Hour
)

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func CreateSession(ctx context.Context, q db.Querier, userID string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	_, err := q.Exec(ctx,
		`insert into sessions (token_hash, user_id, expires_at) values ($1,$2,$3)`,
		hashToken(token), userID, time.Now().Add(sessionTTL))
	return token, err
}

func UserIDBySession(ctx context.Context, q db.Querier, token string) (string, error) {
	var uid string
	err := q.QueryRow(ctx,
		`select user_id from sessions where token_hash=$1 and expires_at > now()`,
		hashToken(token)).Scan(&uid)
	if err != nil {
		return "", nil
	} // 未命中一律视为未登录
	return uid, nil
}

func DestroySession(ctx context.Context, q db.Querier, token string) error {
	_, err := q.Exec(ctx, `delete from sessions where token_hash=$1`, hashToken(token))
	return err
}

func SetSessionCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: token, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, Secure: secure,
		MaxAge: int(sessionTTL / time.Second),
	})
}

func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: "", Path: "/", MaxAge: -1})
}
