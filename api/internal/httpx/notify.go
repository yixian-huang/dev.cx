package httpx

import (
	"context"
	"regexp"
	"strings"

	"devcx/internal/db"
	"devcx/internal/ids"
)

// mentionRe matches @handle after the body is lowercased.
// Pattern: @[a-z0-9][a-z0-9-]{1,31} → handle length 2–32.
var mentionRe = regexp.MustCompile(`@[a-z0-9][a-z0-9-]{1,31}`)

// ExtractMentions 从 markdown 正文提取 @handle：输入先 ToLower、去重保序、封顶 5。
func ExtractMentions(body string) []string {
	if body == "" {
		return nil
	}
	matches := mentionRe.FindAllString(strings.ToLower(body), -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(matches))
	out := make([]string, 0, 5)
	for _, m := range matches {
		h := m[1:] // strip @
		if seen[h] {
			continue
		}
		seen[h] = true
		out = append(out, h)
		if len(out) >= 5 {
			break
		}
	}
	return out
}

// insertNotification 插入一条通知。userID==actorID 时静默跳过（自己不通知自己）。
func insertNotification(ctx context.Context, q db.Querier, userID, kind, actorID string, postID, replyID, projectID *string) error {
	if userID == "" || userID == actorID {
		return nil
	}
	_, err := q.Exec(ctx,
		`insert into notifications (id, user_id, kind, actor_id, post_id, reply_id, project_id)
		 values ($1, $2, $3, $4, $5, $6, $7)`,
		ids.New(), userID, kind, actorID, postID, replyID, projectID)
	return err
}

// resolveHandleIDs 批量把 handle 解析为 user id；找不到的跳过。
func (s *Server) resolveHandleIDs(ctx context.Context, handles []string) []string {
	if s.deps.Pool == nil || len(handles) == 0 {
		return nil
	}
	idsOut := make([]string, 0, len(handles))
	for _, h := range handles {
		var id string
		if err := s.deps.Pool.QueryRow(ctx,
			`select id from users where handle=$1`, h).Scan(&id); err != nil {
			continue
		}
		idsOut = append(idsOut, id)
	}
	return idsOut
}

// notifyOnReply 回复成功后 best-effort 生成通知（reply 优先于 mention，事件级去重）。
func (s *Server) notifyOnReply(ctx context.Context, actorID, postID, replyID, body string, parentID *string) {
	if s.deps.Pool == nil {
		return
	}
	// userID → kind；reply 优先，已有 reply 不被 mention 覆盖。
	recipients := map[string]string{}

	var postAuthor string
	if err := s.deps.Pool.QueryRow(ctx,
		`select author_id from posts where id=$1`, postID).Scan(&postAuthor); err == nil {
		if postAuthor != actorID {
			recipients[postAuthor] = "reply"
		}
	}
	if parentID != nil {
		var parentAuthor string
		if err := s.deps.Pool.QueryRow(ctx,
			`select author_id from replies where id=$1`, *parentID).Scan(&parentAuthor); err == nil {
			if parentAuthor != actorID {
				recipients[parentAuthor] = "reply"
			}
		}
	}
	for _, mid := range s.resolveHandleIDs(ctx, ExtractMentions(body)) {
		if mid == actorID {
			continue
		}
		if _, ok := recipients[mid]; !ok {
			recipients[mid] = "mention"
		}
	}

	pid, rid := postID, replyID
	for userID, kind := range recipients {
		_ = insertNotification(ctx, s.deps.Pool, userID, kind, actorID, &pid, &rid, nil)
	}
}

// notifyOnCreatePost show/build 通知项目关注者(project_update 优先于 mention)；任意 type 扫 mentions。
func (s *Server) notifyOnCreatePost(ctx context.Context, actorID, postID, typ, body string, projectID *string) {
	if s.deps.Pool == nil {
		return
	}
	recipients := map[string]string{}

	if (typ == "show" || typ == "build") && projectID != nil {
		rows, err := s.deps.Pool.Query(ctx,
			`select follower_id from follows where target_kind='project' and target_id=$1`, *projectID)
		if err == nil {
			for rows.Next() {
				var fid string
				if rows.Scan(&fid) != nil {
					continue
				}
				if fid != actorID {
					recipients[fid] = "project_update"
				}
			}
			rows.Close()
		}
	}
	for _, mid := range s.resolveHandleIDs(ctx, ExtractMentions(body)) {
		if mid == actorID {
			continue
		}
		if _, ok := recipients[mid]; !ok {
			recipients[mid] = "mention"
		}
	}

	pid := postID
	for userID, kind := range recipients {
		var proj *string
		if kind == "project_update" {
			proj = projectID
		}
		_ = insertNotification(ctx, s.deps.Pool, userID, kind, actorID, &pid, nil, proj)
	}
}

// notifyMentionsOnly 仅从正文提取 mention 通知（项目反馈等场景）。
func (s *Server) notifyMentionsOnly(ctx context.Context, actorID, postID, body string) {
	if s.deps.Pool == nil {
		return
	}
	pid := postID
	for _, mid := range s.resolveHandleIDs(ctx, ExtractMentions(body)) {
		_ = insertNotification(ctx, s.deps.Pool, mid, "mention", actorID, &pid, nil, nil)
	}
}
