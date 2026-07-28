package httpx

import (
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
)

const maxUploadBytes = 16 << 20 // 16MiB，低于 img.li 硬上限，快速失败

// imgliKeyRE：/i/{key}.ext 或 /t/{key}.jpg 路径中的 key（字母数字与常见安全字符）。
var imgliKeyRE = regexp.MustCompile(`(?i)^[a-z0-9][a-z0-9_-]{0,127}$`)

func imgliBase(cfgBase string) string {
	if cfgBase != "" {
		return strings.TrimRight(cfgBase, "/")
	}
	return "https://img.li"
}

// extractImgliKey 从 img.li 外链解析图片 key。
// 支持 /i/{key}.{ext}、/t/{key}.jpg；拒绝非本 host 与非法 key（防 SSRF/路径穿越）。
func extractImgliKey(rawURL, base string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	b, err := url.Parse(base)
	if err != nil {
		return "", false
	}
	// host 必须匹配（允许同 host 不同 path）
	if !strings.EqualFold(u.Host, b.Host) {
		return "", false
	}
	p := path.Clean("/" + u.Path)
	// /i/key.ext or /t/key.jpg
	parts := strings.Split(strings.Trim(p, "/"), "/")
	if len(parts) < 2 {
		return "", false
	}
	if parts[0] != "i" && parts[0] != "t" {
		return "", false
	}
	baseName := parts[len(parts)-1]
	key := strings.TrimSuffix(baseName, path.Ext(baseName))
	if !imgliKeyRE.MatchString(key) {
		return "", false
	}
	return key, true
}

// handleUpload 代理 POST /api/upload 到 img.li:登录用户上传 multipart 字段 file，
// 服务端持有 img.li 的 Bearer token（永不透传给前端/日志），转发后把 img.li 的
// {key,url,thumbnail_url} 摘出来返回；出错时把 img.li 的状态码与 data.code 原样透传。
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if currentUserID(r) == "" {
		Err(w, 401, "auth_required")
		return
	}
	if s.deps.Cfg.IMGLIToken == "" {
		Err(w, 503, "upload_unconfigured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	file, header, err := r.FormFile("file")
	if err != nil {
		// MaxBytesReader 超限也走到这里
		Err(w, 413, "file_too_large")
		return
	}
	defer file.Close()

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		fw, err := mw.CreateFormFile("file", header.Filename)
		if err == nil {
			_, err = io.Copy(fw, file)
		}
		mw.Close()
		pw.CloseWithError(err)
	}()

	base := imgliBase(s.deps.Cfg.IMGLIBase)
	req, err := http.NewRequestWithContext(r.Context(), "POST", base+"/api/v1/upload", pr)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.deps.Cfg.IMGLIToken)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		Err(w, 502, "upload_failed")
		return
	}
	defer res.Body.Close()

	var envelope struct {
		Status bool `json:"status"`
		Data   struct {
			Code string `json:"code"`
			Key  string `json:"key"`
			Links struct {
				URL          string `json:"url"`
				ThumbnailURL string `json:"thumbnail_url"`
			} `json:"links"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil || !envelope.Status {
		code := envelope.Data.Code
		if code == "" {
			code = "upload_failed"
		}
		status := res.StatusCode
		if status < 400 {
			status = 502
		}
		if ra := res.Header.Get("Retry-After"); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		Err(w, status, code)
		return
	}
	key := envelope.Data.Key
	if key == "" {
		// 兼容：从 url 反推
		if k, ok := extractImgliKey(envelope.Data.Links.URL, base); ok {
			key = k
		}
	}
	WriteJSON(w, 200, map[string]string{
		"key":           key,
		"url":           envelope.Data.Links.URL,
		"thumbnail_url": envelope.Data.Links.ThumbnailURL,
	})
}

// handleDeleteUpload 代理删除到 img.li：`DELETE /api/v1/images/{key}`（软删进回收站）。
// Body: {"key":"..."} 或 {"url":"https://img.li/i/....png"}（url 必须属于 IMGLIBase host）。
// 需要 Token 具备 full scope（管理删除）；权限不足时透传 403。
func (s *Server) handleDeleteUpload(w http.ResponseWriter, r *http.Request) {
	if currentUserID(r) == "" {
		Err(w, 401, "auth_required")
		return
	}
	if s.deps.Cfg.IMGLIToken == "" {
		Err(w, 503, "upload_unconfigured")
		return
	}
	var in struct {
		Key string `json:"key"`
		URL string `json:"url"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	base := imgliBase(s.deps.Cfg.IMGLIBase)
	key := strings.TrimSpace(in.Key)
	if key == "" && in.URL != "" {
		k, ok := extractImgliKey(in.URL, base)
		if !ok {
			Err(w, 400, "invalid_url")
			return
		}
		key = k
	}
	if !imgliKeyRE.MatchString(key) {
		Err(w, 400, "invalid_key")
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), "DELETE",
		base+"/api/v1/images/"+url.PathEscape(key), nil)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.deps.Cfg.IMGLIToken)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		Err(w, 502, "delete_failed")
		return
	}
	defer res.Body.Close()

	var envelope struct {
		Status bool `json:"status"`
		Data   struct {
			Code    string `json:"code"`
			Key     string `json:"key"`
			Deleted bool   `json:"deleted"`
		} `json:"data"`
	}
	// 允许空 body 的 204；否则解析信封
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if len(body) > 0 {
		_ = json.Unmarshal(body, &envelope)
	}
	if res.StatusCode >= 400 || (len(body) > 0 && !envelope.Status) {
		code := envelope.Data.Code
		if code == "" {
			code = "delete_failed"
		}
		status := res.StatusCode
		if status < 400 {
			status = 502
		}
		Err(w, status, code)
		return
	}
	outKey := envelope.Data.Key
	if outKey == "" {
		outKey = key
	}
	WriteJSON(w, 200, map[string]any{
		"key":     outKey,
		"deleted": true,
	})
}
