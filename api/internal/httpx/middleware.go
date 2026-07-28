package httpx

import (
	"context"
	"log"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"

	"devcx/internal/auth"
	"devcx/internal/config"
	"devcx/internal/settings"
)

type ctxKey int

const ctxUserID ctxKey = 1

// withUser 解析会话 cookie，将 userID 放入 context（未登录为 ""）。
func (s *Server) withUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid := ""
		if c, err := r.Cookie(auth.CookieName); err == nil && s.deps.Pool != nil {
			uid, _ = auth.UserIDBySession(r.Context(), s.deps.Pool, c.Value)
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxUserID, uid)))
	})
}

func currentUserID(r *http.Request) string {
	uid, _ := r.Context().Value(ctxUserID).(string)
	return uid
}

// isAdmin 每次查库而不进 session/context 缓存:处置权限的撤销要即时生效,
// 且 admin 请求量个位数,这一次 QueryRow 不构成负担。
func (s *Server) isAdmin(ctx context.Context, uid string) bool {
	if uid == "" || s.deps.Pool == nil {
		return false
	}
	var role string
	if err := s.deps.Pool.QueryRow(ctx, `select role from users where id=$1`, uid).Scan(&role); err != nil {
		return false
	}
	return role == "admin"
}

// effectiveCfg 返回按 settings 覆盖后的配置副本(DB 优先 env 兜底)。目前只有
// GitHub OAuth 两键需要动态化;SMTP 由 settings.Resolve 直读,不经 Config。
func (s *Server) effectiveCfg(ctx context.Context) config.Config {
	cfg := s.deps.Cfg
	if v, ok := settings.Get(ctx, s.deps.Pool, "github_client_id"); ok {
		cfg.GitHubClientID = v
	}
	if v, ok := settings.Get(ctx, s.deps.Pool, "github_client_secret"); ok {
		cfg.GitHubClientSecret = v
	}
	return cfg
}

// writeGate 内容创建入口的统一 mute/suspend 检查。suspend 后 session 已删,这里的
// suspended 分支只防御「suspend 与该用户在途请求」的竞态。放行返回 true;
// 拒绝时已写好响应(muted 附带 muted_until 供前端展示期限)。
func (s *Server) writeGate(w http.ResponseWriter, r *http.Request, uid string) bool {
	var mutedUntil, suspendedAt, verifiedAt *time.Time
	if err := s.deps.Pool.QueryRow(r.Context(),
		`select muted_until, suspended_at, email_verified_at from users where id=$1`, uid).
		Scan(&mutedUntil, &suspendedAt, &verifiedAt); err != nil {
		Err(w, 500, "internal")
		return false
	}
	if suspendedAt != nil {
		Err(w, 403, "suspended")
		return false
	}
	if mutedUntil != nil && mutedUntil.After(time.Now()) {
		WriteJSON(w, 403, map[string]any{
			"error":       "muted",
			"muted_until": mutedUntil.UTC().Format(time.RFC3339),
		})
		return false
	}
	// 软门(spec 增补二):可登录可读,不可创建内容。
	if verifiedAt == nil {
		Err(w, 403, "email_unverified")
		return false
	}
	return true
}

type rateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]*bucket
	lastSweep time.Time
}
type bucket struct {
	tokens float64
	last   time.Time
}

func newRateLimiter() *rateLimiter { return &rateLimiter{buckets: map[string]*bucket{}} }

// allow: 每分钟 10 个令牌，突发上限 10。
//
// buckets 没有容量上限，而 auth 端点公网可达、会持续被扫描器/撞库流量喂入新 IP，
// 因此这里顺带做惰性淘汰：每隔至少 10 分钟遍历一次 buckets，删掉 10 分钟内无活动的
// 条目。这类条目此时必然已经回满令牌（回满只需 1 分钟），删除等价于重置，不改变
// 限流语义；淘汰逻辑复用已持有的 rl.mu，不引入第二把锁或后台 goroutine。
func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	if now.Sub(rl.lastSweep) > 10*time.Minute {
		for k, b := range rl.buckets {
			if now.Sub(b.last) > 10*time.Minute {
				delete(rl.buckets, k)
			}
		}
		rl.lastSweep = now
	}
	b, ok := rl.buckets[ip]
	if !ok {
		b = &bucket{tokens: 10, last: now}
		rl.buckets[ip] = b
	}
	b.tokens = min(10, b.tokens+now.Sub(b.last).Minutes()*10)
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// parseTrustedProxies 解析逗号分隔的 CIDR 列表；无法解析的条目静默跳过，
// 空输入返回 nil（=不信任任何代理）。
func parseTrustedProxies(raw string) []netip.Prefix {
	var out []netip.Prefix
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if p, err := netip.ParsePrefix(part); err == nil {
			out = append(out, p)
		}
	}
	return out
}

func addrIsTrusted(addr netip.Addr, trusted []netip.Prefix) bool {
	for _, p := range trusted {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// rateLimitKey 决定限流桶的 key。默认（也是反代不可信时）恒用 TCP 直连对端地址：
// 伪造 X-Forwarded-For 头不可能改变这个值，因此无法绕过限流。只有当直连对端地址
// 落在 trusted CIDR 列表内（即请求确实来自我们配置信任的反向代理）时，才转而信任
// X-Forwarded-For，取其最右侧、且同样不在 trusted 列表内的那个地址作为真实客户端 IP
// ——最右侧是离我们最近的一跳写入的，多跳可信代理链下更早的字段可被客户端随意伪造。
func rateLimitKey(r *http.Request, trusted []netip.Prefix) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr // 解析失败退回原始字符串，仍是一个可用的（若不太精确的）key
	}
	if len(trusted) == 0 {
		return host
	}
	addr, err := netip.ParseAddr(host)
	if err != nil || !addrIsTrusted(addr, trusted) {
		return host
	}
	xff := r.Header.Get("X-Forwarded-For")
	parts := strings.Split(xff, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		candidate := strings.TrimSpace(parts[i])
		a, err := netip.ParseAddr(candidate)
		if err != nil {
			continue
		}
		if !addrIsTrusted(a, trusted) {
			return candidate
		}
	}
	return host
}

// protect 施加限流、安全响应头、CORS 与请求日志。
func (s *Server) protect(next http.Handler) http.Handler {
	rl := newRateLimiter()
	trusted := parseTrustedProxies(s.deps.Cfg.TrustedProxies)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// start 提到最前面、日志用 defer 收尾，这样限流 429 与 CORS 预检 204 的
		// 早退路径也会被记录——限流触发时恰恰最需要看到日志。
		start := time.Now()
		defer func() { log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start)) }()

		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if o := s.deps.Cfg.AllowOrigin; o != "" && r.Header.Get("Origin") == o {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE")
			if r.Method == http.MethodOptions {
				w.WriteHeader(204)
				return
			}
		}
		if strings.HasPrefix(r.URL.Path, "/api/auth/") || r.URL.Path == "/api/waitlist" {
			if !rl.allow(rateLimitKey(r, trusted)) {
				Err(w, http.StatusTooManyRequests, "rate_limited")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
