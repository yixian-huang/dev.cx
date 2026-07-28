package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"

	"devcx/internal/config"
)

func GitHubOAuthConfig(cfg config.Config) *oauth2.Config {
	return &oauth2.Config{
		ClientID: cfg.GitHubClientID, ClientSecret: cfg.GitHubClientSecret,
		RedirectURL: cfg.BaseURL + "/api/auth/github/callback",
		Scopes:      []string{"read:user", "user:email"},
		Endpoint:    oauth2.Endpoint{AuthURL: cfg.GitHubAuthURL, TokenURL: cfg.GitHubTokenURL},
	}
}

// GitHubLogin 用授权码换 token 并取 GitHub 身份。返回 (id, login, err)：
// id 是 GitHub 侧不可变的数字账号标识，用于登录匹配；login 是可变用户名，仅作展示，
// 会在原账号改名/注销后被他人重新注册，绝不能用它来判定账号身份（见调用方 github_handlers.go）。
func GitHubLogin(ctx context.Context, cfg config.Config, code string) (int64, string, error) {
	tok, err := GitHubOAuthConfig(cfg).Exchange(ctx, code)
	if err != nil {
		return 0, "", err
	}
	req, err := http.NewRequestWithContext(ctx, "GET", cfg.GitHubAPIURL+"/user", nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return 0, "", fmt.Errorf("github /user: %d", resp.StatusCode)
	}
	var u struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return 0, "", err
	}
	return u.ID, u.Login, nil
}
