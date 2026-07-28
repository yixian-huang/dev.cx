package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"devcx/internal/config"
	"devcx/internal/db"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

// fakeImgli 起一个假 img.li:校验 Bearer 与 multipart,按 script 回应。
func fakeImgli(t *testing.T, wantToken string, status int, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/upload" {
			t.Errorf("path = %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer "+wantToken {
			t.Errorf("auth header = %q", got)
		}
		if _, _, err := r.FormFile("file"); err != nil {
			t.Errorf("no file field: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		io.WriteString(w, body)
	}))
}

func multipartBody(t *testing.T, field, name string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile(field, name)
	fw.Write(content)
	mw.Close()
	return &buf, mw.FormDataContentType()
}

// newTestServerWithImgli 按现有测试的引导方式(testutil.TestPool + NewServer + Cfg 注入,
// 见 project_list_test.go/github_test.go)起服务,多注入 img.li 的 token/base 两个字段。
// handleUpload 会经真实出站 HTTP 请求把文件转发到 base(测试里指向 fakeImgli),因此这里
// 必须是一个真实监听的 httptest.Server,而不能只用 httptest.NewRecorder 直接派发——
// 后者仍能覆盖入站路由/鉴权,但用真实 server 能让整条链路(含真实 net/http 客户端往返、
// multipart 编解码)都被覆盖到,和 brief 给出的测试代码(用 http.DefaultClient 打真实 URL)保持一致。
func newTestServerWithImgli(t *testing.T, token, imgliBase string) (*pgxpool.Pool, string) {
	t.Helper()
	pool := testutil.TestPool(t)
	cfg := config.Load()
	cfg.IMGLIToken = token
	cfg.IMGLIBase = imgliBase
	srv := NewServer(Deps{Pool: pool, Cfg: cfg})
	ts := httptest.NewServer(srv)
	t.Cleanup(ts.Close)
	return pool, ts.URL
}

// registerAndLogin 通过真实 HTTP 调用 /api/auth/register 创建一个新用户;注册成功即建立
// 会话(见 register_test.go 对 Set-Cookie 的断言),因此无需再单独调用登录端点,函数名里的
// "AndLogin" 只是描述最终效果。invite 码通过一条独立的直连数据库连接铸造,而不复用
// newTestServerWithImgli 里 testutil.TestPool 持有的那条连接——那条连接握着 session 级
// advisory lock 直到测试结束才释放(见 testutil/db.go),同一测试内若再调用 TestPool 会
// 等待自己持有的锁,直接死锁;这里的独立连接只做一次普通 insert,不参与、也不需要那把锁。
func registerAndLogin(t *testing.T, base, handle string) string {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	pool, err := db.Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	codes, err := invite.Mint(context.Background(), pool, 1, 1, "t")
	if err != nil {
		t.Fatalf("mint invite: %v", err)
	}
	body := `{"invite_code":"` + codes[0] + `","email":"` + handle + `@dev.cx","password":"pw123456","handle":"` + handle + `","display_name":"` + handle + `"}`
	res, err := http.Post(base+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(res.Body)
		t.Fatalf("register status = %d body=%s", res.StatusCode, b)
	}
	return strings.Split(res.Header.Get("Set-Cookie"), ";")[0]
}

func TestUploadProxy(t *testing.T) {
	img := fakeImgli(t, "bl_test", 200,
		`{"status":true,"message":"ok","data":{"key":"k1","links":{"url":"https://img.li/i/k1.png","thumbnail_url":"https://img.li/t/k1.jpg"}}}`)
	defer img.Close()

	// 实现者注意:newTestServer 需要能注入 IMGLIToken/IMGLIBase 配置——
	// 按现有测试引导的配置注入方式(读 server_test.go / testutil),把
	// Cfg.IMGLIToken = "bl_test"、Cfg.IMGLIBase = img.URL 传进去。
	_, base := newTestServerWithImgli(t, "bl_test", img.URL)
	cookie := registerAndLogin(t, base, "uploader")

	body, ctype := multipartBody(t, "file", "shot.png", []byte("PNGDATA"))
	req, _ := http.NewRequest("POST", base+"/api/upload", body)
	req.Header.Set("Content-Type", ctype)
	req.Header.Set("Cookie", cookie)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		b, _ := io.ReadAll(res.Body)
		t.Fatalf("status = %d body=%s", res.StatusCode, b)
	}
	var m map[string]string
	json.NewDecoder(res.Body).Decode(&m)
	if m["url"] != "https://img.li/i/k1.png" || m["thumbnail_url"] != "https://img.li/t/k1.jpg" {
		t.Fatalf("body = %v", m)
	}
}

func TestUploadRequiresAuth(t *testing.T) {
	img := fakeImgli(t, "bl_test", 200, `{"status":true,"data":{}}`)
	defer img.Close()
	_, base := newTestServerWithImgli(t, "bl_test", img.URL)
	body, ctype := multipartBody(t, "file", "a.png", []byte("x"))
	req, _ := http.NewRequest("POST", base+"/api/upload", body)
	req.Header.Set("Content-Type", ctype)
	res, _ := http.DefaultClient.Do(req)
	if res.StatusCode != 401 {
		t.Fatalf("status = %d", res.StatusCode)
	}
	res.Body.Close()
}

func TestUploadUnconfigured(t *testing.T) {
	_, base := newTestServerWithImgli(t, "", "") // 无 token
	cookie := registerAndLogin(t, base, "uploader2")
	body, ctype := multipartBody(t, "file", "a.png", []byte("x"))
	req, _ := http.NewRequest("POST", base+"/api/upload", body)
	req.Header.Set("Content-Type", ctype)
	req.Header.Set("Cookie", cookie)
	res, _ := http.DefaultClient.Do(req)
	if res.StatusCode != 503 {
		t.Fatalf("status = %d", res.StatusCode)
	}
	var e map[string]string
	json.NewDecoder(res.Body).Decode(&e)
	res.Body.Close()
	if e["error"] != "upload_unconfigured" {
		t.Fatalf("error = %v", e)
	}
}

func TestUploadErrorPassthrough(t *testing.T) {
	img := fakeImgli(t, "bl_test", 413,
		`{"status":false,"message":"too big","data":{"code":"file_too_large"}}`)
	defer img.Close()
	_, base := newTestServerWithImgli(t, "bl_test", img.URL)
	cookie := registerAndLogin(t, base, "uploader3")
	body, ctype := multipartBody(t, "file", "big.png", []byte("xxxx"))
	req, _ := http.NewRequest("POST", base+"/api/upload", body)
	req.Header.Set("Content-Type", ctype)
	req.Header.Set("Cookie", cookie)
	res, _ := http.DefaultClient.Do(req)
	if res.StatusCode != 413 {
		t.Fatalf("status = %d", res.StatusCode)
	}
	var e map[string]string
	json.NewDecoder(res.Body).Decode(&e)
	res.Body.Close()
	if e["error"] != "file_too_large" {
		t.Fatalf("error = %v", e)
	}
}
