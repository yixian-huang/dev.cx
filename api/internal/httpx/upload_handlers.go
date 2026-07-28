package httpx

import (
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
)

const maxUploadBytes = 16 << 20 // 16MiB，低于 img.li 硬上限，快速失败

// handleUpload 代理 POST /api/upload 到 img.li:登录用户上传 multipart 字段 file，
// 服务端持有 img.li 的 Bearer token（永不透传给前端/日志），转发后把 img.li 的
// {url, thumbnail_url} 摘出来返回；出错时把 img.li 的状态码与 data.code 原样透传。
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

	base := s.deps.Cfg.IMGLIBase
	if base == "" {
		base = "https://img.li"
	}
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
			Code  string `json:"code"`
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
	WriteJSON(w, 200, map[string]string{
		"url":           envelope.Data.Links.URL,
		"thumbnail_url": envelope.Data.Links.ThumbnailURL,
	})
}
