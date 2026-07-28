package httpx

import (
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"devcx/internal/mailer"
	"devcx/internal/settings"
)

const maxSettingValueLen = 500

func (s *Server) handleAdminListSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	ctx := r.Context()
	out := make([]map[string]any, 0, len(settings.Known))
	for _, k := range settings.Known {
		item := map[string]any{"key": k.Name, "secret": k.Secret}
		dbVal, inDB := settings.Get(ctx, s.deps.Pool, k.Name)
		envVal := ""
		if k.Env != "" {
			envVal = osGetenv(k.Env)
		}
		switch {
		case inDB:
			item["configured"], item["source"] = true, "db"
			var at time.Time
			if err := s.deps.Pool.QueryRow(ctx,
				`select updated_at from settings where key=$1`, k.Name).Scan(&at); err == nil {
				item["updated_at"] = at
			}
			if !k.Secret {
				item["value"] = dbVal
			}
		case envVal != "":
			item["configured"], item["source"] = true, "env"
			if !k.Secret {
				item["value"] = envVal
			}
		default:
			item["configured"], item["source"] = false, "none"
		}
		out = append(out, item)
	}
	WriteJSON(w, 200, map[string]any{"settings": out})
}

// osGetenv 独立成变量便于测试注入(与 config.Load 的直接读取解耦)。
var osGetenv = os.Getenv

func (s *Server) handleAdminPutSetting(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	key := r.PathValue("key")
	if _, known := settings.Lookup(key); !known {
		Err(w, 400, "unknown_key")
		return
	}
	var in struct {
		Value string `json:"value"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	in.Value = strings.TrimSpace(in.Value)
	if in.Value == "" {
		Err(w, 400, "bad_input")
		return
	}
	if utf8.RuneCountInString(in.Value) > maxSettingValueLen {
		Err(w, 400, "too_long")
		return
	}
	if err := settings.Set(r.Context(), s.deps.Pool, key, in.Value, uid); err != nil {
		Err(w, 500, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminDeleteSetting(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	key := r.PathValue("key")
	if _, known := settings.Lookup(key); !known {
		Err(w, 400, "unknown_key")
		return
	}
	if err := settings.Unset(r.Context(), s.deps.Pool, key); err != nil {
		Err(w, 500, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleAdminSMTPTest 用当前有效配置给 admin 自己的邮箱发测试邮件——配置正确性的
// 唯一真实验证面(mailer 无法离线测)。
func (s *Server) handleAdminSMTPTest(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	host := settings.Resolve(ctx, s.deps.Pool, "smtp_host")
	port := settings.Resolve(ctx, s.deps.Pool, "smtp_port")
	from := settings.Resolve(ctx, s.deps.Pool, "smtp_from")
	if host == "" || port == "" || from == "" {
		Err(w, 400, "smtp_unconfigured")
		return
	}
	var to string
	if err := s.deps.Pool.QueryRow(ctx, `select email from users where id=$1`, uid).Scan(&to); err != nil {
		Err(w, 500, "internal")
		return
	}
	if err := mailer.Send(host, port,
		settings.Resolve(ctx, s.deps.Pool, "smtp_username"),
		settings.Resolve(ctx, s.deps.Pool, "smtp_password"),
		from, to, "dev.cx SMTP test",
		"This is a test message from the dev.cx admin settings page."); err != nil {
		Err(w, 502, "smtp_failed")
		return
	}
	WriteJSON(w, 200, map[string]any{"ok": true, "to": to})
}
