package config

import "os"

type Config struct {
	Addr                                        string // 监听地址
	DatabaseURL                                 string
	Env                                         string // dev | prod
	AllowOrigin                                 string // dev 下前端来源，如 http://localhost:3002
	GitHubClientID, GitHubClientSecret          string
	GitHubAuthURL, GitHubTokenURL, GitHubAPIURL string // 可注入测试端点
	BaseURL                                     string // 本服务对外地址，用于 OAuth 回调
	// TrustedProxies 是逗号分隔的 CIDR 列表（如 "10.0.0.0/8,172.16.0.0/12"），
	// 声明哪些直连对端地址是本服务信任的反向代理。默认空字符串＝不信任任何代理，
	// 限流等逻辑一律按 TCP 对端地址取 key，绝不无条件采信 X-Forwarded-For
	// （否则任何客户端伪造该头即可让限流退化为形同虚设）。
	TrustedProxies string
	IMGLIToken     string // img.li 上传 API 的 Bearer token；空＝未配置，上传端点返回 503
	IMGLIBase      string // img.li API base，可注入测试端点
}

func Load() Config {
	get := func(k, d string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return d
	}
	return Config{
		Addr:               get("ADDR", ":8787"),
		DatabaseURL:        get("DATABASE_URL", "postgres://devcx:devcx@localhost:5432/devcx?sslmode=disable"),
		Env:                get("APP_ENV", "dev"),
		AllowOrigin:        get("ALLOW_ORIGIN", "http://localhost:3002"),
		GitHubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		GitHubAuthURL:      get("GITHUB_AUTH_URL", "https://github.com/login/oauth/authorize"),
		GitHubTokenURL:     get("GITHUB_TOKEN_URL", "https://github.com/login/oauth/access_token"),
		GitHubAPIURL:       get("GITHUB_API_URL", "https://api.github.com"),
		BaseURL:            get("BASE_URL", "http://localhost:8787"),
		TrustedProxies:     get("TRUSTED_PROXIES", ""),
		IMGLIToken:         os.Getenv("IMGLI_TOKEN"),
		IMGLIBase:          get("IMGLI_BASE", "https://img.li"),
	}
}
