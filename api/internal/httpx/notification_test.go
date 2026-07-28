package httpx_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"devcx/internal/config"
	"devcx/internal/httpx"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestExtractMentions(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"empty", "", nil},
		{"none", "hello world", nil},
		{"single", "hi @alice", []string{"alice"}},
		{"multiple", "@alice and @bob hi", []string{"alice", "bob"}},
		{"dedupe", "@alice @bob @alice", []string{"alice", "bob"}},
		{"cap5", "@a1 @a2 @a3 @a4 @a5 @a6", []string{"a1", "a2", "a3", "a4", "a5"}},
		{"case", "Hey @Alice and @BOB", []string{"alice", "bob"}},
		{"too_short", "x @a y", nil},
		{"illegal_char_stops", "hi @ab!cd", []string{"ab"}},
		{"with_hyphen", "ping @cool-dev please", []string{"cool-dev"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := httpx.ExtractMentions(c.in)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("ExtractMentions(%q) = %#v, want %#v", c.in, got, c.want)
			}
		})
	}
}

func TestNotificationGenerationAndAPI(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})

	mkUser := func(handle, email string) string {
		codes, _ := invite.Mint(context.Background(), pool, 1, 1, "t")
		reg := postJSON(t, srv, "/api/auth/register",
			`{"invite_code":"`+codes[0]+`","email":"`+email+`","password":"pw123456","handle":"`+handle+`","display_name":"`+handle+`"}`)
		if reg.Code != 201 {
			t.Fatalf("register %s → %d %s", handle, reg.Code, reg.Body)
		}
		pool.Exec(context.Background(), `update users set email_verified_at=now() where handle='`+handle+`'`)
		return strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	}
	send := func(cookie, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	countKind := func(handle, kind string) int {
		t.Helper()
		var n int
		err := pool.QueryRow(context.Background(),
			`select count(*) from notifications n
			 join users u on u.id = n.user_id
			 where u.handle=$1 and n.kind=$2`, handle, kind).Scan(&n)
		if err != nil {
			t.Fatalf("count %s/%s: %v", handle, kind, err)
		}
		return n
	}

	a := mkUser("nota", "nota@dev.cx")
	b := mkUser("notb", "notb@dev.cx")
	c := mkUser("notc", "notc@dev.cx")

	// A 建项目
	if rec := send(a, "POST", "/api/projects",
		`{"slug":"not-proj","name":"Not Proj","tagline":"t","stage":"wip"}`); rec.Code != 201 {
		t.Fatalf("create project → %d %s", rec.Code, rec.Body)
	}
	// B 关注项目
	if rec := send(b, "PUT", "/api/follows/project/not-proj", ""); rec.Code != 204 {
		t.Fatalf("follow project → %d %s", rec.Code, rec.Body)
	}

	// A 发 show 帖 → B 收 project_update；A 自己不收
	pr := send(a, "POST", "/api/posts",
		`{"type":"show","project_slug":"not-proj","title":"shipped v1","body_md":"hello"}`)
	if pr.Code != 201 {
		t.Fatalf("create show → %d %s", pr.Code, pr.Body)
	}
	slug := extractSlug(t, pr.Body.String())
	if n := countKind("notb", "project_update"); n != 1 {
		t.Fatalf("B project_update = %d, want 1", n)
	}
	if n := countKind("nota", "project_update"); n != 0 {
		t.Fatalf("A should not get project_update, got %d", n)
	}

	// B 回复 A 的帖 → A 收 reply
	if rec := send(b, "POST", "/api/posts/"+slug+"/replies",
		`{"body_md":"nice work"}`); rec.Code != 201 {
		t.Fatalf("B reply → %d %s", rec.Code, rec.Body)
	}
	if n := countKind("nota", "reply"); n != 1 {
		t.Fatalf("A reply notif = %d, want 1", n)
	}

	// A 回复自己的帖 → 无新 reply 通知
	if rec := send(a, "POST", "/api/posts/"+slug+"/replies",
		`{"body_md":"self note"}`); rec.Code != 201 {
		t.Fatalf("A self reply → %d %s", rec.Code, rec.Body)
	}
	if n := countKind("nota", "reply"); n != 1 {
		t.Fatalf("A self-reply should not add reply notif, got %d", n)
	}

	// B 回复并 @notc 与 @nota → notc 收 mention；nota 只多 0 条 reply（去重，reply 优先）
	beforeAReply := countKind("nota", "reply")
	beforeAMention := countKind("nota", "mention")
	if rec := send(b, "POST", "/api/posts/"+slug+"/replies",
		`{"body_md":"cc @notc and @nota"}`); rec.Code != 201 {
		t.Fatalf("mention reply → %d %s", rec.Code, rec.Body)
	}
	if n := countKind("notc", "mention"); n != 1 {
		t.Fatalf("C mention = %d, want 1", n)
	}
	if n := countKind("nota", "reply"); n != beforeAReply+1 {
		t.Fatalf("A should get one more reply (not mention), reply=%d want %d", n, beforeAReply+1)
	}
	if n := countKind("nota", "mention"); n != beforeAMention {
		t.Fatalf("A should not get mention when also post author, mention=%d", n)
	}

	// GET /api/notifications（B：1 条 project_update）
	listB := send(b, "GET", "/api/notifications", "")
	if listB.Code != 200 {
		t.Fatalf("list B → %d %s", listB.Code, listB.Body)
	}
	var envB struct {
		Notifications []map[string]any `json:"notifications"`
		Unread        int              `json:"unread_count"`
		Next          any              `json:"next_cursor"`
	}
	if err := json.Unmarshal(listB.Body.Bytes(), &envB); err != nil {
		t.Fatalf("decode list B: %v", err)
	}
	if envB.Unread < 1 || len(envB.Notifications) < 1 {
		t.Fatalf("B list unread=%d len=%d body=%s", envB.Unread, len(envB.Notifications), listB.Body)
	}
	item := envB.Notifications[0]
	if item["kind"] != "project_update" {
		t.Errorf("B first kind = %v, want project_update", item["kind"])
	}
	if item["read"] != false {
		t.Errorf("B first read = %v, want false", item["read"])
	}
	if item["actor"] == nil {
		t.Error("B first missing actor")
	}
	if item["post"] == nil {
		t.Error("B first missing post")
	}
	if item["project"] == nil {
		t.Error("B first missing project")
	}

	// A 列表：至少 2 条 reply；unread_count 匹配
	listA := send(a, "GET", "/api/notifications", "")
	if listA.Code != 200 {
		t.Fatalf("list A → %d %s", listA.Code, listA.Body)
	}
	var envA struct {
		Notifications []map[string]any `json:"notifications"`
		Unread        int              `json:"unread_count"`
	}
	if err := json.Unmarshal(listA.Body.Bytes(), &envA); err != nil {
		t.Fatalf("decode list A: %v", err)
	}
	if envA.Unread != len(envA.Notifications) {
		// all unread so far; may equal total if no older
		t.Logf("A unread=%d list_len=%d", envA.Unread, len(envA.Notifications))
	}
	if envA.Unread < 2 {
		t.Fatalf("A unread_count=%d, want >=2", envA.Unread)
	}
	// reply_excerpt 应存在于 reply 类通知
	foundExcerpt := false
	for _, n := range envA.Notifications {
		if n["kind"] == "reply" && n["reply_excerpt"] != nil {
			foundExcerpt = true
			break
		}
	}
	if !foundExcerpt {
		t.Errorf("A list missing reply_excerpt on reply notifs: %s", listA.Body)
	}

	// 标已读 ids
	var firstID string
	if id, ok := envA.Notifications[0]["id"].(string); ok {
		firstID = id
	} else {
		t.Fatalf("no id in first notif")
	}
	if rec := send(a, "POST", "/api/notifications/read",
		`{"ids":["`+firstID+`"]}`); rec.Code != 204 {
		t.Fatalf("mark ids → %d %s", rec.Code, rec.Body)
	}
	listA2 := send(a, "GET", "/api/notifications", "")
	var envA2 struct {
		Unread int `json:"unread_count"`
	}
	_ = json.Unmarshal(listA2.Body.Bytes(), &envA2)
	if envA2.Unread != envA.Unread-1 {
		t.Fatalf("after mark one: unread=%d, want %d", envA2.Unread, envA.Unread-1)
	}

	// all 标已读
	if rec := send(a, "POST", "/api/notifications/read", `{"all":true}`); rec.Code != 204 {
		t.Fatalf("mark all → %d %s", rec.Code, rec.Body)
	}
	listA3 := send(a, "GET", "/api/notifications", "")
	var envA3 struct {
		Unread int `json:"unread_count"`
	}
	_ = json.Unmarshal(listA3.Body.Bytes(), &envA3)
	if envA3.Unread != 0 {
		t.Fatalf("after mark all: unread=%d, want 0", envA3.Unread)
	}

	// 用户 X 无法把 Y 的通知标已读：用 C 的 cookie 标 B 的通知 id
	listB2 := send(b, "GET", "/api/notifications", "")
	var envB2 struct {
		Notifications []map[string]any `json:"notifications"`
		Unread        int              `json:"unread_count"`
	}
	_ = json.Unmarshal(listB2.Body.Bytes(), &envB2)
	if len(envB2.Notifications) == 0 {
		t.Fatal("B has no notifications to test cross-user mark")
	}
	bID, _ := envB2.Notifications[0]["id"].(string)
	beforeB := envB2.Unread
	if rec := send(c, "POST", "/api/notifications/read",
		`{"ids":["`+bID+`"]}`); rec.Code != 204 {
		t.Fatalf("C mark B's id → %d %s", rec.Code, rec.Body)
	}
	listB3 := send(b, "GET", "/api/notifications", "")
	var envB3 struct {
		Unread int `json:"unread_count"`
	}
	_ = json.Unmarshal(listB3.Body.Bytes(), &envB3)
	if envB3.Unread != beforeB {
		t.Fatalf("cross-user mark should not affect B: unread=%d want %d", envB3.Unread, beforeB)
	}

	// /api/me 含 unread_notifications；public resolve 不含
	meB := send(b, "GET", "/api/me", "")
	if meB.Code != 200 {
		t.Fatalf("me → %d %s", meB.Code, meB.Body)
	}
	var me struct {
		User map[string]any `json:"user"`
	}
	if err := json.Unmarshal(meB.Body.Bytes(), &me); err != nil {
		t.Fatalf("decode me: %v", err)
	}
	if me.User["unread_notifications"] == nil {
		t.Fatalf("me missing unread_notifications: %s", meB.Body)
	}
	if int(me.User["unread_notifications"].(float64)) != beforeB {
		t.Errorf("me unread = %v, want %d", me.User["unread_notifications"], beforeB)
	}
	res := send("", "GET", "/api/resolve/notb", "")
	if res.Code != 200 {
		t.Fatalf("resolve → %d", res.Code)
	}
	if strings.Contains(res.Body.String(), "unread_notifications") {
		t.Errorf("public resolve must not include unread_notifications: %s", res.Body)
	}

	// 匿名 GET notifications → 401
	if rec := send("", "GET", "/api/notifications", ""); rec.Code != 401 {
		t.Errorf("anon list → %d, want 401", rec.Code)
	}
	// bad_input
	if rec := send(a, "POST", "/api/notifications/read", `{}`); rec.Code != 400 ||
		!strings.Contains(rec.Body.String(), "bad_input") {
		t.Errorf("empty read body → %d %s, want 400 bad_input", rec.Code, rec.Body)
	}
}

func TestModerationNotificationMessage(t *testing.T) {
	pool := testutil.TestPool(t)
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: config.Load()})
	ctx := context.Background()
	codes, _ := invite.Mint(ctx, pool, 2, 1, "t")
	reg := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[0]+`","email":"a@dev.cx","password":"pw123456","handle":"opx","display_name":"U"}`)
	adminCk := strings.Split(reg.Header().Get("Set-Cookie"), ";")[0]
	reg2 := postJSON(t, srv, "/api/auth/register",
		`{"invite_code":"`+codes[1]+`","email":"b@dev.cx","password":"pw123456","handle":"warned","display_name":"U"}`)
	userCk := strings.Split(reg2.Header().Get("Set-Cookie"), ";")[0]
	pool.Exec(ctx, `update users set role='admin' where handle='opx'`)

	req := httptest.NewRequest("POST", "/api/admin/users/warned/warn",
		strings.NewReader(`{"message":"注意红线"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", adminCk)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != 204 {
		t.Fatalf("warn → %d %s", rec.Code, rec.Body)
	}

	req2 := httptest.NewRequest("GET", "/api/notifications", nil)
	req2.Header.Set("Cookie", userCk)
	rec2 := httptest.NewRecorder()
	srv.ServeHTTP(rec2, req2)
	body := rec2.Body.String()
	if !strings.Contains(body, `"kind":"moderation"`) || !strings.Contains(body, "注意红线") {
		t.Errorf("moderation notification missing message: %s", body)
	}
}
